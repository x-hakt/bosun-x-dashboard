#!/usr/bin/env node
// BXD-100: disk alerts. Replays a real day (2026-09-25, when a remote host's backup staging
// hit 94.8% and nobody noticed) through the same path the sampler uses: judgeDisk, then
// raise/resolve on the notifications file.
//   node --test scripts/test/disk-alerts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { judgeDisk, diskAlertConfig, DISK_ALERT_DEFAULTS } from "../../src/lib/infra/disk-alerts.mjs";
import { normalise, raise, resolve, dismiss, visible } from "../../src/lib/notifications-core.mjs";

const spike = JSON.parse(fs.readFileSync(new URL("./fixtures/disk-spike-2026-09-25.json", import.meta.url), "utf8"));
const cfg = diskAlertConfig(undefined);
const KEY = "disk:cloud-vps";

// What capacity-sample.mjs does after each sample, over a whole series.
function replay(samples, config = cfg, onStep) {
  let file = normalise(null);
  const events = [];
  for (let i = 0; i < samples.length; i++) {
    const now = new Date(samples[i].t);
    const current = file.notifications.find((n) => n.key === KEY && n.state !== "resolved") ?? null;
    const verdict = judgeDisk("cloud-vps", samples.slice(Math.max(0, i - 12), i + 1), config, current);
    if (verdict.action === "raise") {
      const r = raise(file, { key: KEY, title: verdict.title, body: verdict.body, detail: verdict.detail, level: verdict.level, source: "disk", href: "/servers/cloud-vps" }, now);
      file = r.file;
      if (r.change !== "unchanged") events.push({ t: samples[i].t, change: r.change, level: verdict.level, title: verdict.title, detail: verdict.detail });
    } else if (verdict.action === "resolve") {
      const r = resolve(file, KEY, now);
      file = r.file;
      if (r.found) events.push({ t: samples[i].t, change: "resolved" });
    }
    if (onStep) file = onStep(file, samples[i]) ?? file;
  }
  return { file, events };
}

test("replaying 2026-09-25: one warning, one critical, one clear for the spike", () => {
  const { events } = replay(spike);
  const spikeEvents = events.filter((e) => e.t < "2026-09-25T06:20:00Z");
  assert.deepEqual(
    spikeEvents.map((e) => [e.t, e.change, e.level ?? ""]),
    [
      ["2026-09-25T05:00:01Z", "created", "warn"],
      ["2026-09-25T05:05:01Z", "updated", "urgent"],
      // 05:10 it fell to 69.5% but went back to 87.5% at 05:30: the alert holds (still
      // critical, never stepping down) and clears after 30 quiet minutes.
      ["2026-09-25T06:05:01Z", "resolved", ""],
    ],
  );
  assert.equal(spikeEvents[1].title, "cloud-vps disk is over 93% full");
  assert.equal(spikeEvents[1].detail, "94.8% used, 3.3 GB free");
});

test("the same day's later 49% -> 69% jump in 20 minutes warns as filling fast, then clears", () => {
  const later = replay(spike).events.filter((e) => e.t >= "2026-09-25T06:20:00Z");
  assert.deepEqual(later.map((e) => [e.change, e.level ?? ""]), [["reopened", "warn"], ["resolved", ""]]);
  assert.equal(later[0].title, "cloud-vps disk is filling fast");
});

test("while it stays high nothing repeats: a dismissed alert stays dismissed as the figure moves", () => {
  let dismissedAt = null;
  const { file } = replay(spike.filter((s) => s.t <= "2026-09-25T05:30:02Z"), cfg, (f, s) => {
    if (s.t === "2026-09-25T05:05:01Z") {
      dismissedAt = s.t;
      return dismiss(f, f.notifications[0].id, new Date(s.t)).file;
    }
  });
  assert.ok(dismissedAt);
  assert.equal(visible(file, new Date("2026-09-25T05:31:00Z")).length, 0);
  assert.equal(file.notifications[0].state, "dismissed");
  assert.match(file.notifications[0].detail, /^87\.5% used, /, "the live figure kept moving underneath");
});

test("a steady high host raises once and escalates once", () => {
  const at = (m) => new Date(Date.parse("2026-09-26T00:00:00Z") + m * 60_000).toISOString();
  const size = 100e9;
  const series = [80, 86, 86.5, 87, 88, 93.5, 94, 94].map((p, i) => ({ t: at(i * 5), disk_used: (p / 100) * size, disk_size: size }));
  const { events } = replay(series);
  assert.deepEqual(events.map((e) => `${e.change}:${e.level}`), ["created:warn", "updated:urgent"]);
});

test("a quiet host never raises; config is validated; false turns it off", () => {
  const flat = spike.slice(0, 40);
  assert.deepEqual(replay(flat).events, []);
  assert.equal(diskAlertConfig(false), null);
  assert.deepEqual(diskAlertConfig({}), DISK_ALERT_DEFAULTS);
  assert.throws(() => diskAlertConfig({ warn: 95, critical: 90 }), /clear_below <= warn < critical/);
  assert.throws(() => diskAlertConfig({ warn: "85" }), /positive number/);
});
