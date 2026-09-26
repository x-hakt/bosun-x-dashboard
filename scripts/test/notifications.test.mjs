#!/usr/bin/env node
// BXD-99: notifications — the raise/dismiss/resolve rules, and the locked store under
// concurrent writers.
//   node --test scripts/test/notifications.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { raise, resolve, dismiss, snooze, visible, prune, normalise } from "../../src/lib/notifications-core.mjs";
import { readNotifications, updateNotifications } from "../../src/lib/notifications-store.mjs";

const T0 = new Date("2026-09-26T09:00:00.000Z");
const at = (mins) => new Date(T0.getTime() + mins * 60_000);
const empty = () => normalise(null);

test("raising a key twice updates one notification", () => {
  let { file, change } = raise(empty(), { key: "planner:x-hakt-topics", title: "Pick topics", body: "6 cards" }, T0);
  assert.equal(change, "created");
  ({ file, change } = raise(file, { key: "planner:x-hakt-topics", title: "Pick topics", body: "9 cards" }, at(5)));
  assert.equal(change, "updated");
  assert.equal(file.notifications.length, 1);
  assert.equal(file.notifications[0].body, "9 cards");
  assert.equal(file.notifications[0].count, 2);
  assert.equal(file.notifications[0].source, "planner");
  ({ change } = raise(file, { key: "planner:x-hakt-topics", title: "Pick topics", body: "9 cards" }, at(6)));
  assert.equal(change, "unchanged");
});

test("a dismissed notification stays away until its news changes", () => {
  let { file, notification } = raise(empty(), { key: "a", title: "Topics", body: "6 cards" }, T0);
  ({ file } = dismiss(file, notification.id, at(1)));
  assert.equal(visible(file, at(2)).length, 0);
  let change;
  ({ file, change } = raise(file, { key: "a", title: "Topics", body: "6 cards" }, at(3)));
  assert.equal(change, "unchanged");
  assert.equal(visible(file, at(3)).length, 0);
  ({ file, change } = raise(file, { key: "a", title: "Topics", body: "9 cards" }, at(4)));
  assert.equal(change, "reopened");
  assert.equal(visible(file, at(4)).length, 1);
  assert.equal(file.notifications[0].closedAt, undefined);
});

test("a resolved notification comes back on the next raise; resolve is by key", () => {
  let { file } = raise(empty(), { key: "disk:caspar", title: "Disk 91%", level: "urgent" }, T0);
  let found;
  ({ file, found } = resolve(file, "disk:caspar", at(1)));
  assert.equal(found, true);
  assert.equal(file.notifications[0].state, "resolved");
  assert.equal(resolve(file, "disk:caspar", at(2)).found, false);
  ({ file } = raise(file, { key: "disk:caspar", title: "Disk 91%", level: "urgent" }, at(3)));
  assert.equal(file.notifications[0].state, "open");
});

test("snoozed ones hide until the time; visible sorts urgent, warn, info, then newest", () => {
  let file = empty();
  ({ file } = raise(file, { key: "i1", title: "info old" }, T0));
  ({ file } = raise(file, { key: "u1", title: "urgent", level: "urgent" }, at(1)));
  ({ file } = raise(file, { key: "i2", title: "info new" }, at(2)));
  ({ file } = raise(file, { key: "w1", title: "warn", level: "warn" }, at(3)));
  assert.deepEqual(visible(file, at(4)).map((n) => n.key), ["u1", "w1", "i2", "i1"]);
  const id = file.notifications.find((n) => n.key === "w1").id;
  ({ file } = snooze(file, id, at(60)));
  assert.deepEqual(visible(file, at(30)).map((n) => n.key), ["u1", "i2", "i1"]);
  assert.equal(visible(file, at(61)).length, 4);
});

test("bad input is refused", () => {
  assert.throws(() => raise(empty(), { key: "Has Spaces", title: "x" }, T0), /bad notification key/);
  assert.throws(() => raise(empty(), { key: "ok", title: "  " }, T0), /needs a title/);
  assert.throws(() => raise(empty(), { key: "ok", title: "x", level: "panic" }, T0), /level must be/);
});

test("prune drops closed ones after 30 days and keeps open ones", () => {
  let file = empty();
  ({ file } = raise(file, { key: "old", title: "old" }, T0));
  ({ file } = raise(file, { key: "open", title: "open" }, T0));
  ({ file } = resolve(file, "old", T0));
  assert.equal(prune(file, at(60 * 24 * 29)).notifications.length, 2);
  assert.deepEqual(prune(file, at(60 * 24 * 31)).notifications.map((n) => n.key), ["open"]);
});

test("ids keep counting even if seq was lost", () => {
  const file = normalise({ notifications: [{ id: "N-7", key: "k", title: "t", level: "info", state: "open", created: "", updated: "", count: 1 }] });
  assert.equal(raise(file, { key: "k2", title: "t" }, T0).notification.id, "N-8");
});

test("the store survives concurrent writers without losing a raise", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bosun-notify-"));
  try {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => updateNotifications(dir, (file) => raise(file, { key: `k${i}`, title: `n${i}` }, T0))),
    );
    const file = await readNotifications(dir);
    assert.equal(file.notifications.length, 20);
    assert.equal(new Set(file.notifications.map((n) => n.id)).size, 20);
    assert.equal(file.seq, 20);
    const left = (await fs.readdir(dir)).filter((f) => f !== "notifications.yml");
    assert.deepEqual(left, [], "no lock or temp files left behind");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the notify CLI raises, lists and resolves", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bosun-notify-cli-"));
  const cli = fileURLToPath(new URL("../notify.mjs", import.meta.url));
  const run = (...args) => execFileSync("node", [cli, ...args], { env: { ...process.env, BOSUN_DATA: dir }, encoding: "utf8" });
  try {
    assert.match(run("raise", "--key", "planner:topics", "--title", "Pick topics", "--level", "warn", "--href", "https://planner.example/launches"), /^created N-1 \[warn\]/);
    assert.match(run("list"), /N-1 \[warn\] planner:topics: Pick topics -> https:\/\/planner.example\/launches/);
    assert.match(run("resolve", "--key", "planner:topics"), /resolved/);
    assert.match(run("list"), /nothing needs you/);
    assert.match(run("list", "--all"), /\(resolved\)/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
