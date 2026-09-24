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
const { buildHostCapacity, parseMemUsage } = await import(pathToFileURL(tmp).href);

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
