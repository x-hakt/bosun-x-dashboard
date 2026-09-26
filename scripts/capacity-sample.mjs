#!/usr/bin/env node
// BXD-62: one capacity sample of every live-monitored server host, appended as
// JSONL to $BACKUP_RECEIPTS/_capacity/<UTC date>.jsonl. Normally run every 5 minutes
// by scripts/capacity-sample.sh (cron on the host the dashboard runs on), which owns
// the lock, the job heartbeat and retention. Read-only everywhere: the local host
// runs the same command sequence the app does (LOCAL_SNAPSHOT_SCRIPT), remote hosts
// are reached through their forced read-only SSH command (bosun-x-ro.sh).
//
// One line per host per run:
//   {"t":"…Z","host":"home-server","ok":true,"cores":8,"mem_total":…,"mem_used":…,
//    "disk_size":…,"disk_used":…,"load1":0.5,"c":{"<container>":[memBytes,cpuPercent]}}
//   {"t":"…Z","host":"cloud-vps","ok":false,"error":"…"}
// Containers are recorded by name; the dashboard maps them to projects at read
// time (BXD-63) with the same discovery it uses everywhere else.
//
// Exit: 0 if at least one host was sampled, 1 if none were (so the job shows failed).
//
// --disk (BXD-65/66, daily): per-project disk footprint instead. Runs LOCAL_DISK_SCRIPT
// on the local host and asks each remote host's forced read-only command for exactly
// `bosun-x-disk` (the same sequence), then writes the parsed result, never the raw
// output, to _capacity/disk-<UTC date>.json as {"t":…,"hosts":{"<id>":{…}}}.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import {
  LOCAL_DISK_SCRIPT,
  LOCAL_SNAPSHOT_SCRIPT,
  parseDiskSections,
  parseHostFigures,
  parseMemUsage,
  parseStatsLines,
  section,
} from "../src/lib/infra/snapshot-sections.mjs";
import { diskAlertConfig, judgeDisk } from "../src/lib/infra/disk-alerts.mjs";
import { raise, resolve } from "../src/lib/notifications-core.mjs";
import { updateNotifications } from "../src/lib/notifications-store.mjs";
import { resolveDataDir } from "./lib/data-dir.mjs";

const run = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = resolveDataDir(repoRoot);

async function readYaml(file) {
  try {
    return loadYaml(await fs.readFile(file, "utf-8")) ?? {};
  } catch {
    return {};
  }
}

const expandHome = (p) => (p && p.startsWith("~/") ? path.join(process.env.HOME ?? "", p.slice(2)) : p);

const config = await readYaml(path.join(dataDir, "config.yml"));
const receipts = path.resolve(expandHome(process.env.BACKUP_RECEIPTS || config.backup_receipts || path.join(dataDir, "..", "backup-receipts")));
// The discovery (read-only) key's SSH config, as the app uses. Deliberately NOT
// $BACKUP_SSH_CONFIG: that one maps aliases to the backup key's forced command.
const sshConfig = expandHome(config.ssh_config || path.join(process.env.HOME ?? "", ".ssh", "config"));
const outDir = path.join(receipts, "_capacity");

const hostsFile = await readYaml(path.join(dataDir, "infra", "hosts.yml"));
const hosts = (hostsFile.hosts ?? []).filter((h) => h.live_monitored && h.role !== "workstation");
if (hosts.length === 0) {
  console.error(`capacity-sample: no live-monitored server hosts in ${path.join(dataDir, "infra", "hosts.yml")}`);
  process.exit(1);
}

async function snapshotText(host) {
  if (host.ssh_alias) {
    const { stdout } = await run(
      "ssh",
      ["-F", sshConfig, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host.ssh_alias, "bosun-x-ro"],
      { timeout: 45_000, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  }
  const { stdout } = await run("sh", ["-c", LOCAL_SNAPSHOT_SCRIPT], { timeout: 45_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

const t = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

if (process.argv.includes("--disk")) {
  const out = { t, hosts: {} };
  for (const host of hosts) {
    try {
      const { stdout } = host.ssh_alias
        ? await run(
            "ssh",
            ["-F", sshConfig, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host.ssh_alias, "bosun-x-disk"],
            { timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 },
          )
        : await run("sh", ["-c", LOCAL_DISK_SCRIPT], { timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 });
      const record = parseDiskSections(stdout);
      if (!record.diskSizeBytes) throw new Error("no DISK section in output");
      out.hosts[host.id] = { t, ...record };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${t}] capacity-disk: ${host.id} failed: ${message.split("\n")[0].slice(0, 300)}`);
    }
  }
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `disk-${t.slice(0, 10)}.json`);
  const okCount = Object.keys(out.hosts).length;
  if (okCount > 0) await fs.writeFile(file, JSON.stringify(out));
  console.error(`[${t}] capacity-disk: ${okCount}/${hosts.length} hosts → ${okCount ? file : "(nothing written)"}`);
  process.exit(okCount > 0 ? 0 : 1);
}
const lines = await Promise.all(
  hosts.map(async (host) => {
    try {
      const raw = await snapshotText(host);
      const h = parseHostFigures(raw);
      if (!h.hasMem) throw new Error("no MEMINFO section in snapshot output");
      const c = {};
      for (const s of parseStatsLines(section(raw, "DOCKER_STATS"))) {
        c[s.name] = [Math.round(parseMemUsage(s.memUsage)), Math.round(s.cpuPercent * 100) / 100];
      }
      return {
        t,
        host: host.id,
        ok: true,
        cores: h.cores,
        mem_total: h.memTotalBytes,
        mem_used: h.memUsedBytes,
        disk_size: h.diskSizeBytes,
        disk_used: h.diskUsedBytes,
        load1: h.loadAvg1,
        c,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { t, host: host.id, ok: false, error: message.split("\n")[0].slice(0, 300) };
    }
  }),
);

await fs.mkdir(outDir, { recursive: true });
const file = path.join(outDir, `${t.slice(0, 10)}.jsonl`);
await fs.appendFile(file, lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : ""));

const okCount = lines.filter((l) => l.ok).length;
for (const l of lines) if (!l.ok) console.error(`[${t}] capacity-sample: ${l.host} failed: ${l.error}`);

// BXD-100: judge each sampled host's disk and raise/resolve its `disk:<host>` notification
// (the Overview "Needs you" list). A host that failed to sample is left as it was. Never
// fails the sample run.
try {
  const cfg = diskAlertConfig(config.disk_alerts);
  if (cfg) await diskAlerts(cfg, lines.filter((l) => l.ok).map((l) => l.host));
} catch (err) {
  console.error(`[${t}] capacity-sample: disk alerts failed: ${err instanceof Error ? err.message : err}`);
}
console.error(`[${t}] capacity-sample: ${okCount}/${lines.length} hosts → ${file}`);
process.exit(hosts.length > 0 && okCount === 0 ? 1 : 0);

async function diskAlerts(cfg, hostIds) {
  // Enough history for the climb window and the quiet period before clearing.
  const from = Date.parse(t) - (Math.max(cfg.climb_minutes, cfg.clear_minutes) + 15) * 60_000;
  const days = [...new Set([new Date(from).toISOString().slice(0, 10), t.slice(0, 10)])];
  const recent = [];
  for (const day of days) {
    const text = await fs.readFile(path.join(outDir, `${day}.jsonl`), "utf-8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const l = JSON.parse(line);
        if (l.ok && Date.parse(l.t) >= from) recent.push(l);
      } catch {
        // a torn line from a concurrent append; skip it
      }
    }
  }
  const now = new Date(t);
  await updateNotifications(dataDir, (file) => {
    for (const host of hostIds) {
      const key = `disk:${host}`;
      const standing = file.notifications.find((n) => n.key === key && n.state !== "resolved") ?? null;
      const samples = recent.filter((l) => l.host === host).sort((a, b) => a.t.localeCompare(b.t));
      const verdict = judgeDisk(host, samples, cfg, standing);
      if (verdict.action === "raise") {
        const r = raise(file, { key, title: verdict.title, body: verdict.body, detail: verdict.detail, level: verdict.level, source: "disk", href: `/servers/${host}` }, now);
        file = r.file;
        if (r.change !== "unchanged") console.error(`[${t}] capacity-sample: disk alert ${r.change} for ${host}: ${verdict.title} (${verdict.detail})`);
      } else if (verdict.action === "resolve") {
        file = resolve(file, key, now).file;
        console.error(`[${t}] capacity-sample: disk alert cleared for ${host}`);
      }
    }
    return { file };
  }, now);
}
