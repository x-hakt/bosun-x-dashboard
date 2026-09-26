// BXD-100: disk alerts from the capacity samples. Pure: given one host's recent samples and
// whether an alert is already standing, say what to do with its `disk:<host>` notification.
// scripts/capacity-sample.mjs runs this after every 5-minute sample and applies the result
// through the notifications store (BXD-99), so an alert raises once, escalates, and clears
// itself; nothing repeats while usage stays high.
//
// config.yml (all optional; `disk_alerts: false` turns them off):
//   disk_alerts:
//     warn: 85            # percent used
//     critical: 93
//     climb_points: 15    # a rise this big ...
//     climb_minutes: 30   # ... within this long warns even below `warn`
//     clear_below: 82     # a standing alert clears only once usage has stayed under this ...
//     clear_minutes: 30   # ... for this long (no flapping while a backup stages and unstages)
//
// While an alert stands it never steps down (a critical stays critical until it clears);
// only its live figure (`detail`) keeps updating, which never reopens a dismissed one.

export const DISK_ALERT_DEFAULTS = { warn: 85, critical: 93, climb_points: 15, climb_minutes: 30, clear_below: 82, clear_minutes: 30 };

/** @param {unknown} raw config.yml's `disk_alerts` */
export function diskAlertConfig(raw) {
  if (raw === false) return null;
  const c = { ...DISK_ALERT_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  for (const k of Object.keys(DISK_ALERT_DEFAULTS)) {
    if (typeof c[k] !== "number" || !Number.isFinite(c[k]) || c[k] <= 0) throw new Error(`disk_alerts.${k} must be a positive number`);
  }
  if (!(c.clear_below <= c.warn && c.warn < c.critical && c.critical <= 100)) {
    throw new Error("disk_alerts needs clear_below <= warn < critical <= 100");
  }
  return c;
}

const FAST = "filling fast";
const gb = (bytes) => `${(bytes / 1e9).toFixed(1)} GB`;

/**
 * @param {string} host
 * @param {{ t: string, disk_used: number, disk_size: number }[]} samples  this host's ok samples, oldest first
 * @param {typeof DISK_ALERT_DEFAULTS} cfg
 * @param {{ level: string, title: string, body?: string } | null} standing  this host's unresolved
 *   disk alert (open, snoozed or dismissed), or null
 * @returns {{ action: "raise", level: "warn" | "urgent", title: string, body: string, detail: string }
 *   | { action: "resolve" } | { action: "none" }}
 */
export function judgeDisk(host, samples, cfg, standing) {
  const usable = samples.filter((s) => s.disk_size > 0 && Number.isFinite(s.disk_used));
  const last = usable.at(-1);
  if (!last) return { action: "none" };
  const pct = (s) => (100 * s.disk_used) / s.disk_size;
  const now = pct(last);
  const since = Date.parse(last.t) - cfg.climb_minutes * 60_000;
  const window = usable.filter((s) => Date.parse(s.t) >= since);
  const low = Math.min(...window.map(pct));
  const climb = now - low;
  const detail = `${now.toFixed(1)}% used, ${gb(last.disk_size - last.disk_used)} free`;
  const verdict = judgeLevel(host, now, climb, cfg);
  const rank = (level) => (level === "urgent" ? 2 : level === "warn" ? 1 : 0);

  if (standing) {
    // Step up, or swap "filling fast" for the threshold it has now crossed.
    const sharper = verdict && (rank(verdict.level) > rank(standing.level) || (standing.title.endsWith(FAST) && !verdict.title.endsWith(FAST)));
    if (sharper) return { action: "raise", ...verdict, detail };
    const quietSince = Date.parse(last.t) - cfg.clear_minutes * 60_000;
    const recent = usable.filter((s) => Date.parse(s.t) >= quietSince);
    const coveredFrom = usable.find((s) => Date.parse(s.t) <= quietSince);
    if (!verdict && coveredFrom && recent.every((s) => pct(s) < cfg.clear_below)) return { action: "resolve" };
    const level = standing.level === "urgent" ? "urgent" : "warn";
    return { action: "raise", level, title: standing.title, body: standing.body ?? "", detail };
  }
  return verdict ? { action: "raise", ...verdict, detail } : { action: "none" };
}

function judgeLevel(host, now, climb, cfg) {
  if (now >= cfg.critical) {
    return {
      action: "raise",
      level: "urgent",
      title: `${host} disk is over ${cfg.critical}% full`,
      body: "Containers and databases start failing when it fills. Look for staged images, logs and old backups.",
    };
  }
  if (now >= cfg.warn) {
    return {
      action: "raise",
      level: "warn",
      title: `${host} disk is over ${cfg.warn}% full`,
      body: "Worth freeing space before it gets critical.",
    };
  }
  if (climb >= cfg.climb_points) {
    return {
      action: "raise",
      level: "warn",
      title: `${host} disk is ${FAST}`,
      body: `Up ${climb.toFixed(0)} points in ${cfg.climb_minutes} minutes. Something is writing a lot.`,
    };
  }
  return null;
}
