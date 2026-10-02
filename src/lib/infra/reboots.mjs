// BXD-112: reboot alerts. Pure: given the tail of a finished boot's journal, say whether the
// machine was shut down on purpose; given a host's reboot records, say what to do with its
// `reboot:<host>` notification. scripts/boot-check.mjs reads the journal, writes the records
// to <receipts>/_events/reboots.jsonl and applies the verdict through the notifications store.
//
// An "unclean" reboot is a boot whose journal just stops: no shutdown was ever started. That
// is a power cut, a hardware reset or a hang someone power-cycled. A shutdown someone started
// (even one that lost power half-way through) counts as clean.
//
// config.yml (all optional; `reboot_alerts: false` turns them off):
//   reboot_alerts:
//     window_days: 7    # how far back unclean reboots are counted, and how long a quiet spell
//                       # must last before a standing alert clears itself
//     urgent_at: 2      # this many unclean reboots inside the window makes the alert urgent

export const REBOOT_ALERT_DEFAULTS = { window_days: 7, urgent_at: 2 };

/** @param {unknown} raw config.yml's `reboot_alerts` */
export function rebootAlertConfig(raw) {
  if (raw === false) return null;
  const c = { ...REBOOT_ALERT_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  for (const k of Object.keys(REBOOT_ALERT_DEFAULTS)) {
    if (typeof c[k] !== "number" || !Number.isFinite(c[k]) || c[k] < 1) throw new Error(`reboot_alerts.${k} must be a number of at least 1`);
  }
  return c;
}

// Lines systemd writes once a shutdown or reboot is under way. Any one of them in the last
// few hundred lines of a boot means somebody (or something) asked for it.
const SHUTDOWN_MARKERS = [
  /^Journal stopped$/,
  /^Reached target (shutdown|reboot|poweroff|halt|kexec)\.target\b/,
  /^Reached target System (Shutdown|Reboot|Power Off|Halt)\b/,
  /^System is (powering down|rebooting|halting)\b/,
  /^The system will (power off|reboot|halt|suspend) now/,
  /^Shutting down\.$/,
];

/** @param {string[]} lines the last few hundred journal lines of a finished boot, message text only */
export function shutdownStarted(lines) {
  return lines.some((l) => SHUTDOWN_MARKERS.some((re) => re.test(l.trim())));
}

/**
 * One line of reboots.jsonl. `prev` is the boot that ended, `next` the one that followed;
 * `sample` is the last capacity sample taken before `prev` ended (or null).
 * @param {string} host
 * @param {{ boot_id: string, last_entry: number }} prev   last_entry in ms since epoch
 * @param {{ boot_id: string, first_entry: number }} next  first_entry in ms since epoch
 * @param {boolean} clean
 * @param {{ t: string, load1?: number, mem_used?: number, mem_total?: number } | null} sample
 */
export function rebootRecord(host, prev, next, clean, sample) {
  const rec = {
    id: `${host}:${next.boot_id}`,
    host,
    at: new Date(next.first_entry).toISOString(), // back up
    down_at: new Date(prev.last_entry).toISOString(), // last thing the old boot logged
    down_s: Math.max(0, Math.round((next.first_entry - prev.last_entry) / 1000)),
    clean,
  };
  if (sample) {
    rec.sample_at = sample.t;
    if (typeof sample.load1 === "number") rec.load1 = sample.load1;
    if (typeof sample.mem_used === "number") rec.mem_used = sample.mem_used;
    if (typeof sample.mem_total === "number") rec.mem_total = sample.mem_total;
  }
  return rec;
}

const gb = (b) => `${(b / 1e9).toFixed(1)} GB`;
const duration = (s) => (s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

/**
 * What to do with `reboot:<host>`. Raise while the newest unclean reboot is inside the window;
 * the body names that reboot, so a new one changes it and reopens a dismissed alert. Resolve
 * once a standing alert has had a whole window without one.
 * @param {string} host        id for the key
 * @param {string} name        readable name for the text
 * @param {ReturnType<typeof rebootRecord>[]} records  this host's records, any order
 * @param {Date} now
 * @param {typeof REBOOT_ALERT_DEFAULTS} cfg
 * @param {{ state: string, level?: string } | null} standing  the open notification, if any
 * @param {(iso: string) => string} clock      how to print a time (the instance's zone)
 */
export function judgeReboots(host, name, records, now, cfg, standing, clock) {
  const since = now.getTime() - cfg.window_days * 86_400_000;
  const unclean = records.filter((r) => !r.clean && Date.parse(r.at) >= since).sort((a, b) => a.at.localeCompare(b.at));
  if (unclean.length === 0) return standing ? { action: "resolve" } : { action: "none" };
  const last = unclean[unclean.length - 1];
  const n = unclean.length;
  const before = [];
  if (typeof last.load1 === "number") before.push(`load ${last.load1}`);
  if (typeof last.mem_used === "number") before.push(`memory ${gb(last.mem_used)}${typeof last.mem_total === "number" ? ` of ${gb(last.mem_total)}` : ""}`);
  const body = [
    `Went down at ${clock(last.down_at)} without shutting down, back up at ${clock(last.at)} (${duration(last.down_s)} later).`,
    before.length ? `Just before: ${before.join(", ")}.` : "No capacity sample from just before.",
    "A journal that just stops usually means lost power or a hardware reset.",
  ].filter(Boolean).join("\n");
  // Never steps down while it stands (as disk alerts): an urgent stays urgent until it clears.
  const level = n >= cfg.urgent_at || (standing && standing.level === "urgent") ? "urgent" : "warn";
  return {
    action: "raise",
    level,
    title: `${name} rebooted without shutting down`,
    body,
    // The count lives in `detail`, which updates without reopening a dismissed alert; the
    // body only changes when there is a new reboot.
    detail: `${n} unclean in ${cfg.window_days} days`,
  };
}
