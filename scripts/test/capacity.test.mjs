#!/usr/bin/env node
// BXD-61: unit tests for the pure capacity join (src/lib/infra/capacity-core.ts).
// The repo has no TS test runner, so this transpiles that one file with the
// TypeScript compiler already in devDependencies and runs node:test against it.
//   node scripts/test/capacity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/infra/capacity-core.ts"), "utf-8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "capacity-test-"));
const tmp = path.join(tmpDir, "capacity-core.mjs");
fs.writeFileSync(tmp, outputText);
fs.copyFileSync(path.join(root, "src/lib/infra/snapshot-sections.mjs"), path.join(tmpDir, "snapshot-sections.mjs"));
const { buildHostCapacity, parseMemUsage, applyHistory, percentile, simulateMove, fitVerdict, buildDiskBar } = await import(pathToFileURL(tmp).href);
const { parseDiskSections } = await import(pathToFileURL(path.join(root, "src/lib/infra/snapshot-sections.mjs")).href);

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const sum = (bar) => bar.segments.reduce((n, s) => n + s.value, 0);
const seg = (bar, key) => bar.segments.find((s) => s.key === key);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} != ${b}`);

const base = {
  hostId: "caspar",
  hostName: "Caspar",
  cores: 8,
  memTotalBytes: 16 * GiB,
  memUsedBytes: 4 * GiB,
  diskSizeBytes: 500e9,
  diskUsedBytes: 170e9,
  loadAvg1: 1.5,
  stats: [
    { name: "play-web", cpuPercent: 20, memBytes: 700 * MiB },
    { name: "play-db", cpuPercent: 10, memBytes: 300 * MiB },
    { name: "cgb-web", cpuPercent: 0, memBytes: 70 * MiB },
    { name: "mystery", cpuPercent: 5, memBytes: 100 * MiB }, // in an unmatched group
    { name: "traefik", cpuPercent: 3, memBytes: 50 * MiB }, // in no group at all
  ],
  groups: [
    { folder: "/srv/playtopia", slug: "playtopia", containers: ["play-web", "play-db"] },
    { folder: "/srv/cgb", slug: "cgburchell", containers: ["cgb-web"] },
    { folder: "/srv/unknown", containers: ["mystery"] },
    // A second group claiming an already-owned container must not double count it.
    { folder: "/srv/dupe", slug: "dupe", containers: ["play-db"] },
    // A group whose container isn't running (no stats) contributes nothing.
    { folder: "/srv/stopped", slug: "stopped", containers: ["stopped-web"] },
  ],
  projects: {
    playtopia: { name: "playtopia.com.au", status: "Live" },
    cgburchell: { name: "cgburchell.com", status: "Live" },
  },
};

test("parseMemUsage handles binary and decimal units", () => {
  assert.equal(parseMemUsage("1.5GiB / 15.5GiB"), 1.5 * GiB);
  assert.equal(parseMemUsage("512MiB / 1GiB"), 512 * MiB);
  assert.equal(parseMemUsage("10kB / 1GB"), 10e3);
  assert.equal(parseMemUsage("0B / 0B"), 0);
  assert.equal(parseMemUsage("garbage"), 0);
});

test("memory segments sum to the host total, grouped by project", () => {
  const { mem } = buildHostCapacity(base);
  close(sum(mem), 16 * GiB, "segments sum to total");
  close(seg(mem, "project:playtopia").value, 1000 * MiB, "playtopia = web + db, db counted once");
  assert.deepEqual(seg(mem, "project:playtopia").containers, ["play-web", "play-db"]);
  assert.equal(seg(mem, "project:dupe"), undefined, "second claim on play-db ignored");
  close(seg(mem, "unregistered").value, 100 * MiB, "unmatched group");
  close(seg(mem, "infra").value, 50 * MiB, "container in no group");
  const containers = 1220 * MiB;
  close(seg(mem, "other").value, 4 * GiB - containers, "host/non-Docker = used - containers");
  close(seg(mem, "free").value, 12 * GiB, "free = total - used");
  close(mem.used, 4 * GiB, "used");
  assert.equal(mem.segments.at(-1).key, "free", "free is last");
  assert.equal(mem.segments[0].key, "project:playtopia", "largest project first");
});

test("host usage below the containers' sum: used is lifted, no negative 'other'", () => {
  const { mem } = buildHostCapacity({ ...base, memUsedBytes: 1 * GiB });
  close(mem.used, 1220 * MiB, "used = container sum");
  assert.equal(seg(mem, "other"), undefined);
  close(sum(mem), 16 * GiB, "still sums to total");
});

test("containers exceeding the host total are scaled to fit, never overflow", () => {
  const { mem } = buildHostCapacity({ ...base, memTotalBytes: 1 * GiB, memUsedBytes: 1 * GiB });
  close(sum(mem), 1 * GiB, "sums to total");
  assert.ok(mem.segments.every((s) => s.value >= 0));
  close(seg(mem, "free").value, 0, "no free space");
});

test("CPU is in cores, with load average as the host total", () => {
  const { cpu } = buildHostCapacity(base);
  close(cpu.total, 8, "8 cores");
  close(seg(cpu, "project:playtopia").value, 0.3, "20% + 10% = 0.3 cores");
  close(seg(cpu, "other").value, 1.5 - 0.38, "load minus containers");
  close(sum(cpu), 8, "sums to cores");
});

test("missing figures give null bars rather than bogus ones", () => {
  const cap = buildHostCapacity({ ...base, memTotalBytes: 0, cores: 0, diskSizeBytes: 0, stats: [] });
  assert.equal(cap.mem, null);
  assert.equal(cap.cpu, null);
  assert.equal(cap.disk, null);
});

test("an idle host is all free apart from host usage", () => {
  const { mem } = buildHostCapacity({ ...base, stats: [], groups: [] });
  assert.deepEqual(mem.segments.map((s) => s.key), ["other", "free"]);
  close(sum(mem), 16 * GiB, "sums to total");
});

// ---------------------------------------------------------------- BXD-63: history
const hour = 3_600_000;
const t0 = Date.parse("2026-09-01T00:00:00Z");
// 30 hourly samples: play-web 500 MiB most of the time, 1500 MiB in the last 2
// (a spike above p95), cgb-web only appears from sample 10, host uses 3 GiB.
const samples = Array.from({ length: 30 }, (_, i) => ({
  t: new Date(t0 + i * hour).toISOString(),
  cores: 8,
  memTotal: 16 * GiB,
  memUsed: 3 * GiB,
  load1: 1,
  c: {
    "play-web": [(i >= 28 ? 1500 : 500) * MiB, 10],
    "play-db": [300 * MiB, 5],
    ...(i >= 10 ? { "cgb-web": [70 * MiB, 0] } : {}),
  },
}));

test("percentile is nearest-rank", () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95), 95);
  assert.equal(percentile([3, 1, 2], 0.5), 2);
});

test("under 24h of history the live bars are kept, with the window reported", () => {
  const live = buildHostCapacity(base);
  const cap = applyHistory(base, live, samples.slice(0, 10));
  assert.equal(cap.mem.basis, "snapshot");
  assert.equal(cap.mem, live.mem);
  assert.equal(cap.history.samples, 10);
  close(cap.history.spanHours, 9, "span");
});

test("with 24h+ of history, bars use per-project p95 and still sum to the total", () => {
  const live = buildHostCapacity(base);
  const cap = applyHistory(base, live, samples);
  const { mem, cpu } = cap;
  assert.equal(mem.basis, "p95");
  close(sum(mem), 16 * GiB, "sums to total");
  close(sum(cpu), 8, "cpu sums to cores");
  const play = seg(mem, "project:playtopia");
  // per-sample playtopia: 800 MiB x28, 1800 MiB x2. Nearest-rank p95 of 30 is the
  // 29th smallest, which is one of the two spikes: 1800 MiB.
  close(play.stats.p95, 1800 * MiB, "p95 is per-sample project totals");
  close(play.stats.peak, 1800 * MiB, "peak");
  close(play.stats.current, live.mem.segments.find((s) => s.key === "project:playtopia").value, "current is the live value");
  const cgb = seg(mem, "project:cgburchell");
  close(cgb.stats.p95, 70 * MiB, "late-appearing container zero-filled before, p95 unaffected");
  assert.ok(mem.segments.every((s) => s.kind === "free" || s.stats), "every non-free segment has stats");
  // live-only containers (mystery, traefik) still appear
  assert.ok(seg(mem, "unregistered") && seg(mem, "infra"));
  close(mem.liveUsed, live.mem.used, "liveUsed carried over");
});

test("a long quiet window: p95 ignores a short spike, peak keeps it", () => {
  const long = Array.from({ length: 200 }, (_, i) => ({
    t: new Date(t0 + i * 10 * 60_000).toISOString(),
    cores: 8, memTotal: 16 * GiB, memUsed: 2 * GiB, load1: 0.5,
    c: { "play-web": [(i === 150 ? 4000 : 400) * MiB, 1] },
  }));
  const { mem } = applyHistory(base, buildHostCapacity(base), long);
  const play = seg(mem, "project:playtopia");
  close(play.stats.p95, 400 * MiB, "spike excluded from p95");
  close(play.stats.peak, 4000 * MiB, "spike kept as peak");
});

test("failed or empty samples are ignored", () => {
  const live = buildHostCapacity(base);
  assert.equal(applyHistory(base, live, []), live);
  assert.equal(applyHistory(base, live, [{ ...samples[0], memTotal: 0 }]), live);
});

// ---------------------------------------------------------------- BXD-64: move simulator
const small = (id, totalGiB, usedGiB, stats = [], groups = []) =>
  buildHostCapacity({ ...base, hostId: id, hostName: id, memTotalBytes: totalGiB * GiB, memUsedBytes: usedGiB * GiB, stats, groups });

test("fitVerdict uses the 80% comfort line", () => {
  assert.equal(fitVerdict(0.5), "ok");
  assert.equal(fitVerdict(0.8), "ok");
  assert.equal(fitVerdict(0.81), "tight");
  assert.equal(fitVerdict(1.01), "over");
});

test("moving a project adds it to the target and frees it on the source", () => {
  const from = buildHostCapacity(base); // playtopia = 1000 MiB
  const to = small("vps", 8, 2);
  const sim = simulateMove(from, to, "playtopia");
  const t = sim.target.mem;
  close(t.moving, 1000 * MiB, "moving amount");
  close(t.bar.used, 2 * GiB + 1000 * MiB, "target used grows by the project");
  assert.ok(t.bar.segments.find((s) => s.key === "project:playtopia").incoming, "marked incoming");
  close(sum(t.bar), 8 * GiB, "target still sums to its total when it fits");
  assert.equal(sim.verdict, "ok");
  const s = sim.source.mem;
  assert.equal(s.bar.segments.find((x) => x.key === "project:playtopia"), undefined, "gone from source");
  close(s.bar.used, from.mem.used - 1000 * MiB, "source frees it");
});

test("tight and over verdicts; overflow is not scaled away", () => {
  const from = buildHostCapacity(base);
  const tight = simulateMove(from, small("vps", 4, 2.5), "playtopia");
  assert.equal(tight.verdict, "tight");
  const over = simulateMove(from, small("vps", 2, 1.5), "playtopia");
  assert.equal(over.verdict, "over");
  close(over.target.mem.overBy, 1.5 * GiB + 1000 * MiB - 2 * GiB, "overBy");
  close(over.target.mem.bar.used, 1.5 * GiB + 1000 * MiB, "used exceeds total");
  close(over.target.mem.bar.segments.at(-1).value, 0, "no free space");
});

test("a project already on the target (also_on) is replaced, not doubled", () => {
  const from = buildHostCapacity(base);
  const to = small("vps", 8, 2, [{ name: "p2", cpuPercent: 0, memBytes: 200 * MiB }], [{ folder: "/x", slug: "playtopia", containers: ["p2"] }]);
  const t = simulateMove(from, to, "playtopia").target.mem;
  assert.equal(t.bar.segments.filter((s) => s.key === "project:playtopia").length, 1);
  close(t.bar.used, 2 * GiB - 200 * MiB + 1000 * MiB, "old copy replaced by the moving one");
});

test("arch mismatch is flagged", () => {
  const from = { ...buildHostCapacity(base), arch: "x86_64" };
  assert.equal(simulateMove(from, { ...small("pi", 8, 1), arch: "aarch64" }, "playtopia").archMismatch, true);
  assert.equal(simulateMove(from, { ...small("vps", 8, 1), arch: "x86_64" }, "playtopia").archMismatch, false);
});

// ---------------------------------------------------------------- BXD-65: disk
const GB = 1e9;
const T = "\t";
const rawDisk = [
  "===DISK===",
  `${500 * GB} ${200 * GB} ${300 * GB} 40%`,
  "===SYSTEM_DF===",
  `I${T}sha256:play${T}1.5GB${T}1GB`,
  `I${T}sha256:pg${T}300MB${T}250MB`,
  `I${T}sha256:old${T}2GB${T}2GB`, // no containers → reclaimable
  `C${T}play-web${T}20MB`,
  `C${T}play-db${T}100MB`,
  `C${T}cgb-web${T}0B`,
  `V${T}play_db_data${T}3GB`,
  `V${T}orphan_vol${T}1GB`, // unused → reclaimable
  "===MOUNTS===",
  `C${T}/play-web${T}sha256:play`,
  `M${T}/play-web${T}bind${T}${T}/srv/playtopia/uploads${T}true`,
  `M${T}/play-web${T}bind${T}${T}/srv/playtopia/uploads/thumbs${T}true`, // nested: counted via parent
  `M${T}/play-web${T}bind${T}${T}/etc/ro-config${T}false`, // read-only: ignored
  `C${T}/play-db${T}sha256:pg`,
  `M${T}/play-db${T}volume${T}play_db_data${T}/var/lib/docker/volumes/play_db_data/_data${T}true`,
  `C${T}/cgb-web${T}sha256:pg`, // shares the pg image with playtopia → split
  "===BIND_DU===",
  `5000000000	/srv/playtopia/uploads`,
  `1000000000	/srv/playtopia/uploads/thumbs`,
  "===END===",
].join("\n");

test("parseDiskSections reads images, containers, volumes, rw binds and du", () => {
  const d = parseDiskSections(rawDisk);
  assert.equal(d.diskSizeBytes, 500 * GB);
  assert.equal(d.images.length, 3);
  assert.deepEqual(d.images[0], { id: "sha256:play", size: 1.5 * GB, unique: 1 * GB });
  const web = d.containers.find((c) => c.name === "play-web");
  assert.deepEqual(web.binds, ["/srv/playtopia/uploads", "/srv/playtopia/uploads/thumbs"], "ro bind dropped");
  assert.equal(web.writable, 20e6);
  assert.deepEqual(d.containers.find((c) => c.name === "play-db").volumes, ["play_db_data"]);
  assert.equal(d.bindDu["/srv/playtopia/uploads"], 5 * GB);
});

test("buildDiskBar attributes images, volumes, binds and writable layers per project", () => {
  const record = { t: "2026-09-25T00:00:00Z", ...parseDiskSections(rawDisk) };
  const input = {
    groups: [
      { folder: "/srv/playtopia", slug: "playtopia", containers: ["play-web", "play-db"] },
      { folder: "/srv/cgb", slug: "cgburchell", containers: ["cgb-web"] },
    ],
    projects: base.projects,
  };
  const bar = buildDiskBar(record, input);
  close(sum(bar), 500 * GB, "sums to disk size");
  // playtopia: play image 1GB + half the pg image 125MB + volume 3GB + uploads 5GB (thumbs nested) + writable 120MB
  close(seg(bar, "project:playtopia").value, 1 * GB + 125e6 + 3 * GB + 5 * GB + 120e6, "playtopia footprint");
  close(seg(bar, "project:cgburchell").value, 125e6, "cgb gets its half of the shared pg image");
  close(seg(bar, "reclaimable").value, 2 * GB + 1 * GB, "unused image + unused volume");
  close(seg(bar, "free").value, 300 * GB, "free = size - used");
  assert.equal(bar.measuredAt, "2026-09-25T00:00:00Z");
});

test("simulator moves disk too when the source is measured, and disk can decide the verdict", () => {
  const record = { ...parseDiskSections(rawDisk) };
  const input = { groups: [{ folder: "/srv/playtopia", slug: "playtopia", containers: ["play-web", "play-db"] }], projects: base.projects };
  const from = { ...buildHostCapacity(base), diskBar: buildDiskBar(record, input) };
  const roomy = { ...small("vps", 8, 1), disk: { total: 63 * GB, used: 10 * GB } };
  const sim = simulateMove(from, roomy, "playtopia");
  close(sim.target.disk.moving, seg(from.diskBar, "project:playtopia").value, "disk moving");
  assert.equal(sim.verdict, "ok");
  const cramped = { ...small("vps", 8, 1), disk: { total: 63 * GB, used: 60 * GB } };
  const tight = simulateMove(from, cramped, "playtopia");
  assert.equal(tight.target.mem.verdict, "ok", "RAM alone is fine");
  assert.equal(tight.verdict, "over", "but disk overflows, so it doesn't fit");
  const unmeasured = simulateMove(buildHostCapacity(base), roomy, "playtopia");
  assert.equal(unmeasured.target.disk, null, "no disk simulation without a source measurement");
});
