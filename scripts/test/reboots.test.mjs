#!/usr/bin/env node
// BXD-112: reboot alerts. Replays a real morning (2026-10-02, when a home server with a dead
// battery lost power three times, then was shut down on purpose to fit a new one) through
// the same path scripts/boot-check.mjs uses: shutdownStarted on each boot's journal tail,
// rebootRecord, judgeReboots, then raise/resolve on the notifications file.
//   node --test scripts/test/reboots.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeReboots, rebootAlertConfig, rebootRecord, shutdownStarted, REBOOT_ALERT_DEFAULTS } from "../../src/lib/infra/reboots.mjs";
import { normalise, raise, resolve, dismiss, visible } from "../../src/lib/notifications-core.mjs";

const cfg = rebootAlertConfig(undefined);
const clock = (iso) => iso.slice(11, 16);
const KEY = "reboot:home-server";

// Journal tails as `journalctl -b <id> -n 400 -o cat` prints them (last few lines).
const CUT = [
  "Starting example-ingress.service - Reconcile the proxy ingress...",
  "example-ingress.service: Deactivated successfully.",
  "(thrax) CMD (/opt/bosun/scripts/lib/job-run.sh container-events --label \"Container log\")",
  "pam_unix(cron:session): session closed for user thrax",
];
const REBOOTED = [
  "Reached target shutdown.target - System Shutdown.",
  "Finished systemd-reboot.service - System Reboot.",
  "Reached target reboot.target - System Reboot.",
  "Shutting down.",
  "Received SIGTERM from PID 1 (systemd-shutdow).",
  "Journal stopped",
];
// Powered off from the desktop, and the journal lost its last writes when the battery came out.
const POWERED_OFF_HALFWAY = [
  "endSessionDialog: No XDG_SESSION_ID, fetched from logind: 85",
  "The system will power off now!",
  "Shutting down GNOME Shell",
  "System is powering down.",
  "unattended-upgrades.service: Deactivated successfully.",
];

test("a journal that just stops is unclean; any started shutdown is clean", () => {
  assert.equal(shutdownStarted(CUT), false);
  assert.equal(shutdownStarted(REBOOTED), true);
  assert.equal(shutdownStarted(POWERED_OFF_HALFWAY), true);
  assert.equal(shutdownStarted([]), false);
  // A service merely mentioning shutdown is not one.
  assert.equal(shutdownStarted(["myapp: graceful shutdown handler registered", "Stopping is not shutting down."]), false);
});

const t = (hhmmss) => Date.parse(`2026-10-02T${hhmmss}Z`);
const boot = (id, first, last) => ({ boot_id: id, first_entry: first, last_entry: last });
// The real morning: three cuts, then two deliberate restarts.
const MORNING = [
  { prev: boot("b0", 0, Date.parse("2026-10-01T14:48:24Z")), next: boot("b1", Date.parse("2026-10-01T14:49:14Z"), 0), tail: CUT, sample: { t: "2026-10-01T14:45:03Z", load1: 5.33, mem_used: 5.7e9, mem_total: 16.6e9 } },
  { prev: boot("b1", 0, Date.parse("2026-10-01T23:44:02Z")), next: boot("b2", Date.parse("2026-10-01T23:45:00Z"), 0), tail: CUT, sample: { t: "2026-10-01T23:40:02Z", load1: 5.37, mem_used: 7.0e9, mem_total: 16.6e9 } },
  { prev: boot("b2", 0, t("00:02:32")), next: boot("b3", t("00:03:28"), 0), tail: CUT, sample: { t: "2026-10-02T00:00:03Z", load1: 3.56, mem_used: 6.2e9, mem_total: 16.6e9 } },
  { prev: boot("b3", 0, t("00:10:56")), next: boot("b4", t("00:26:48"), 0), tail: POWERED_OFF_HALFWAY, sample: null },
  { prev: boot("b4", 0, t("00:34:57")), next: boot("b5", t("00:35:25"), 0), tail: REBOOTED, sample: null },
];
const records = MORNING.map((m) => rebootRecord("home-server", m.prev, m.next, shutdownStarted(m.tail), m.sample));

test("records carry the downtime and the last sample, never more", () => {
  assert.deepEqual(records.map((r) => r.clean), [false, false, false, true, true]);
  assert.deepEqual(records.map((r) => r.down_s), [50, 58, 56, 952, 28]);
  assert.equal(records[2].id, "home-server:b3");
  assert.equal(records[2].load1, 3.56);
  assert.equal(records[3].load1, undefined);
  assert.deepEqual(Object.keys(records[0]).sort(), ["at", "clean", "down_at", "down_s", "host", "id", "load1", "mem_total", "mem_used", "sample_at"]);
});

// What boot-check.mjs does after recording, at a given moment.
function apply(file, recs, now) {
  const standing = file.notifications.find((n) => n.key === KEY && n.state !== "resolved") ?? null;
  const v = judgeReboots("home-server", "Home Server", recs, now, cfg, standing, clock);
  if (v.action === "raise") return { v, file: raise(file, { key: KEY, title: v.title, body: v.body, detail: v.detail, level: v.level, source: "reboot", href: "/servers/home-server" }, now).file };
  if (v.action === "resolve") return { v, file: resolve(file, KEY, now).file };
  return { v, file };
}

test("one cut warns, a second makes it urgent, and it names the latest", () => {
  let file = normalise(null);
  ({ file } = apply(file, records.slice(0, 1), new Date("2026-10-01T14:52:00Z")));
  let open = visible(file, new Date("2026-10-01T14:52:00Z"));
  assert.equal(open.length, 1);
  assert.equal(open[0].level, "warn");
  assert.equal(open[0].title, "Home Server rebooted without shutting down");
  assert.match(open[0].body, /down at 14:48 without shutting down, back up at 14:49 \(50 s later\)/);
  assert.match(open[0].body, /load 5\.33, memory 5\.7 GB of 16\.6 GB/);
  assert.equal(open[0].detail, "1 unclean in 7 days");

  ({ file } = apply(file, records.slice(0, 3), new Date("2026-10-02T00:05:00Z")));
  open = visible(file, new Date("2026-10-02T00:05:00Z"));
  assert.equal(open.length, 1);
  assert.equal(open[0].level, "urgent");
  assert.match(open[0].body, /down at 00:02/);
  assert.equal(open[0].detail, "3 unclean in 7 days");
});

test("deliberate restarts change nothing; Done holds until the next cut", () => {
  let file = normalise(null);
  ({ file } = apply(file, records.slice(0, 3), new Date("2026-10-02T00:05:00Z")));
  const id = visible(file, new Date("2026-10-02T00:05:00Z"))[0].id;
  file = dismiss(file, id, new Date("2026-10-02T00:06:00Z")).file;
  ({ file } = apply(file, records, new Date("2026-10-02T01:00:00Z")));
  assert.equal(visible(file, new Date("2026-10-02T01:00:00Z")).length, 0, "clean restarts must not reopen a dismissed alert");
  // A reboot ageing out of the window only moves the count, which never reopens it either.
  ({ file } = apply(file, records, new Date("2026-10-08T15:00:00Z")));
  assert.equal(visible(file, new Date("2026-10-08T15:00:00Z")).length, 0);
  // A new cut does.
  const cut = rebootRecord("home-server", boot("b5", 0, Date.parse("2026-10-09T03:00:00Z")), boot("b6", Date.parse("2026-10-09T03:01:00Z"), 0), false, null);
  ({ file } = apply(file, [...records, cut], new Date("2026-10-09T03:05:00Z")));
  const open = visible(file, new Date("2026-10-09T03:05:00Z"));
  assert.equal(open.length, 1);
  assert.match(open[0].body, /No capacity sample from just before/);
});

test("urgent never steps down while it stands, and a quiet window clears it", () => {
  let file = normalise(null);
  ({ file } = apply(file, records.slice(0, 3), new Date("2026-10-02T00:05:00Z")));
  // Two of the three age out: still urgent while the alert stands.
  let r = apply(file, records.slice(0, 3), new Date("2026-10-08T23:50:00Z"));
  assert.equal(r.v.level, "urgent");
  assert.equal(r.v.detail, "1 unclean in 7 days");
  // A week after the last cut: resolved.
  r = apply(r.file, records, new Date("2026-10-09T00:10:00Z"));
  assert.equal(r.v.action, "resolve");
  assert.equal(visible(r.file, new Date("2026-10-09T00:10:00Z")).length, 0);
  // Nothing standing and nothing new: nothing to do.
  assert.equal(apply(r.file, records, new Date("2026-10-09T01:00:00Z")).v.action, "none");
});

test("config: defaults, off switch, bad values", () => {
  assert.deepEqual(rebootAlertConfig(undefined), REBOOT_ALERT_DEFAULTS);
  assert.equal(rebootAlertConfig(false), null);
  assert.equal(rebootAlertConfig({ window_days: 3 }).window_days, 3);
  assert.throws(() => rebootAlertConfig({ urgent_at: 0 }), /urgent_at/);
  assert.throws(() => rebootAlertConfig({ window_days: "a week" }), /window_days/);
});
