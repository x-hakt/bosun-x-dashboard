#!/usr/bin/env node
// BXD-112: notice reboots of the host the dashboard runs on, and say when one was unclean.
//
// Reads systemd's boot list (`journalctl --list-boots`). For every boot that has ended since
// the last run, looks at its final journal lines to see whether a shutdown was started, and
// appends one line per reboot to $BACKUP_RECEIPTS/_events/reboots.jsonl:
//   {"id":"caspar:<boot id>","host":"caspar","at":"…Z","down_at":"…Z","down_s":56,"clean":false,
//    "sample_at":"…Z","load1":3.56,"mem_used":…,"mem_total":…}
// (the load and memory are the last capacity sample taken before the old boot ended). Then
// raises, updates or clears the `reboot:<host>` notification (the Overview "Needs you" list)
// with src/lib/infra/reboots.mjs, and the port shows each unclean reboot as a squall.
//
//   node scripts/boot-check.mjs [--host <id>] [--dry-run]
//
// Run it at boot and on a schedule (it only ever records a reboot once):
//   @reboot   sleep 120; /path/to/scripts/lib/job-run.sh boot-check --label "Boot check" --family watchman --every 1h -- /usr/bin/node /path/to/scripts/boot-check.mjs
//   23 * * * * /path/to/scripts/lib/job-run.sh boot-check --label "Boot check" --family watchman --every 1h -- /usr/bin/node /path/to/scripts/boot-check.mjs
// The user needs to be able to read the system journal (the `adm` or `systemd-journal` group).
// The first run records the boots from the last `window_days` the journal still holds.
//
// --host: which infra/hosts.yml host this is. Default: the one whose id or name matches the
// machine's hostname (case-insensitive). Exit 1 if the journal can't be read.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { judgeReboots, rebootAlertConfig, rebootRecord, shutdownStarted } from "../src/lib/infra/reboots.mjs";
import { raise, resolve } from "../src/lib/notifications-core.mjs";
import { updateNotifications } from "../src/lib/notifications-store.mjs";
import { resolveDataDir } from "./lib/data-dir.mjs";

const run = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = resolveDataDir(repoRoot);
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const hostArg = argv.includes("--host") ? argv[argv.indexOf("--host") + 1] : undefined;
const stamp = () => new Date().toISOString();
const say = (msg) => console.error(`[${stamp()}] boot-check: ${msg}`);

async function readYaml(file) {
  try {
    return loadYaml(await fs.readFile(file, "utf-8")) ?? {};
  } catch {
    return {};
  }
}
const expandHome = (p) => (p && p.startsWith("~/") ? path.join(process.env.HOME ?? "", p.slice(2)) : p);

const config = await readYaml(path.join(dataDir, "config.yml"));
const cfg = rebootAlertConfig(config.reboot_alerts);
const receipts = path.resolve(expandHome(process.env.BACKUP_RECEIPTS || config.backup_receipts || path.join(dataDir, "..", "backup-receipts")));
const logFile = path.join(receipts, "_events", "reboots.jsonl");
const tz = process.env.BOSUN_TZ || config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
const clock = (iso) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// Which host is this?
const hosts = ((await readYaml(path.join(dataDir, "infra", "hosts.yml"))).hosts ?? []);
const me = os.hostname().toLowerCase();
const host = hostArg
  ? hosts.find((h) => h.id === hostArg) ?? { id: hostArg, name: hostArg }
  : hosts.find((h) => String(h.id).toLowerCase() === me || String(h.name ?? "").toLowerCase() === me) ?? { id: me, name: os.hostname() };

// Boots, oldest first. first_entry / last_entry come in microseconds.
let boots;
try {
  const { stdout } = await run("journalctl", ["--list-boots", "-o", "json", "--no-pager"], { maxBuffer: 8 << 20 });
  boots = JSON.parse(stdout).map((b) => ({ boot_id: b.boot_id, first_entry: Math.round(b.first_entry / 1000), last_entry: Math.round(b.last_entry / 1000) }))
    .sort((a, b) => a.first_entry - b.first_entry);
} catch (err) {
  say(`can't read the boot list: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  process.exit(1);
}

// What's already recorded.
const text = await fs.readFile(logFile, "utf8").catch(() => "");
const records = [];
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  try {
    records.push(JSON.parse(line));
  } catch {
    /* a torn line is skipped */
  }
}
const seen = new Set(records.map((r) => r.id));
const since = Date.now() - (cfg?.window_days ?? 7) * 86_400_000;

/** The last capacity sample for this host taken in the 15 minutes before `ms`. */
async function sampleBefore(ms) {
  const days = [...new Set([new Date(ms - 15 * 60_000).toISOString().slice(0, 10), new Date(ms).toISOString().slice(0, 10)])];
  let best = null;
  for (const day of days) {
    const t = await fs.readFile(path.join(receipts, "_capacity", `${day}.jsonl`), "utf8").catch(() => "");
    for (const line of t.split("\n")) {
      if (!line.includes(`"host":"${host.id}"`)) continue;
      try {
        const s = JSON.parse(line);
        const at = Date.parse(s.t);
        if (s.ok && at <= ms && at >= ms - 15 * 60_000 && (!best || at > Date.parse(best.t))) best = s;
      } catch {
        /* torn */
      }
    }
  }
  return best;
}

const fresh = [];
for (let i = 1; i < boots.length; i++) {
  const prev = boots[i - 1];
  const next = boots[i];
  const id = `${host.id}:${next.boot_id}`;
  if (seen.has(id) || next.first_entry < since) continue;
  let tail;
  try {
    const { stdout } = await run("journalctl", ["-b", prev.boot_id, "-n", "400", "-o", "cat", "--no-pager"], { maxBuffer: 16 << 20 });
    tail = stdout.split("\n");
  } catch (err) {
    say(`can't read boot ${prev.boot_id}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    continue;
  }
  const rec = rebootRecord(host.id, prev, next, shutdownStarted(tail), await sampleBefore(prev.last_entry));
  fresh.push(rec);
  say(`${rec.clean ? "clean" : "UNCLEAN"} reboot: down ${rec.down_at}, up ${rec.at} (${rec.down_s} s)${rec.load1 !== undefined ? `, load ${rec.load1} before` : ""}`);
}

if (dryRun) {
  for (const r of fresh) console.log(JSON.stringify(r));
} else if (fresh.length) {
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, fresh.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

// The alert: always re-judged, so a quiet week clears it even with nothing new to record.
if (cfg) {
  const mine = [...records, ...fresh].filter((r) => r.host === host.id);
  const key = `reboot:${host.id}`;
  const now = new Date();
  if (dryRun) {
    console.log(JSON.stringify(judgeReboots(host.id, host.name ?? host.id, mine, now, cfg, null, clock)));
  } else {
    await updateNotifications(dataDir, (file) => {
      const standing = file.notifications.find((n) => n.key === key && n.state !== "resolved") ?? null;
      const verdict = judgeReboots(host.id, host.name ?? host.id, mine, now, cfg, standing, clock);
      if (verdict.action === "raise") {
        const r = raise(file, { key, title: verdict.title, body: verdict.body, detail: verdict.detail, level: verdict.level, source: "reboot", href: `/servers/${host.id}` }, now);
        if (r.change !== "unchanged") say(`alert ${r.change}: ${verdict.title} (${verdict.detail})`);
        return { file: r.file };
      }
      if (verdict.action === "resolve") {
        say(`alert cleared: no unclean reboot in ${cfg.window_days} days`);
        return { file: resolve(file, key, now).file };
      }
      return { file };
    }, now);
  }
}
say(`${boots.length} boot(s) in the journal, ${fresh.length} new reboot(s) recorded${dryRun ? " (dry run)" : ""}`);
