#!/usr/bin/env node
// BXD-85..87: the port feed (src/lib/port-core.ts). Mostly the public projection's
// guarantees: nothing private leaks, only whitelisted fields exist, times are rounded,
// identities stay stable between refreshes.
//   node scripts/test/port-feed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const load = (file, resolve) => {
  const source = fs.readFileSync(new URL(`../../src/lib/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(resolve, mod, mod.exports);
  return mod.exports;
};
const state = load("activity-state.ts", require);
const { buildPortFeed } = load("port-core.ts", (name) => (name === "@/lib/activity-state" ? state : require(name)));

const NOW = Date.parse("2026-09-25T10:00:30.000Z");
const MIN = 60_000;
const iso = (minsAgo, sec = 17) => new Date(NOW - minsAgo * MIN + sec * 1000).toISOString();
let n = 0;
const ev = (session, kind, minsAgo, project, extra = {}) => ({
  v: 1, id: `evt-secret-${n++}`, provider: "claude", session, parent: null, turn: null, host: "caspar-secret-host",
  kind, project, task: project === "secret-client" ? "SC-4" : "BX-12", at: iso(minsAgo), received: iso(minsAgo), ...extra,
});

const sources = (now = NOW) => ({
  now,
  events: [
    ev("sess-very-secret-1", "session_start", 50, "bosun-x"),
    ev("sess-very-secret-1", "tool_start", 2, "bosun-x"),
    ev("sess-very-secret-2", "session_start", 40, "secret-client"),
    ev("sess-very-secret-2", "approval_request", 1, "secret-client"),
    ev("sess-very-secret-3", "subagent_start", 30, "secret-client", { parent: "sess-very-secret-2", provider: "codex" }),
    ev("sess-very-secret-4", "turn_start", 3, null),
    ev("sess-very-secret-5", "session_start", 20, "another-private"),
    ev("sess-very-secret-5", "session_end", 10, "another-private"),
  ],
  eventsTruncated: false,
  projects: [
    { slug: "bosun-x", name: "bosun-x CLI", todo: 3, inProgress: 1 },
    { slug: "secret-client", name: "Secret Client Portal", todo: 9, inProgress: 2 },
    { slug: "another-private", name: "Another Private Thing", todo: 1, inProgress: 0 },
  ],
  commits: [
    { project: "secret-client", at: iso(5), id: "deadbeefcafe0000secretcommit" },
    { project: "bosun-x", at: iso(90), id: "0123456789abcdef" },
  ],
  deliveries: [{ project: "secret-client", at: iso(8), id: "secret-client#task-uuid-secret" }],
  carts: [{ project: "secret-client", at: iso(15), id: "secret-client/secret-db@2026" }],
  tides: [iso(4, 0), iso(9, 0)],
  chores: [{ id: "fleet-backup:finish:x", at: iso(300), outcome: "finished", label: "fleet-backup (secret label)" }],
});
const publicOpts = { publicView: true, approved: [{ slug: "bosun-x", alias: "Bosun CLI" }], secret: "test-secret" };

const SECRETS = ["secret-client", "Secret Client", "another-private", "Another Private", "sess-very-secret", "caspar-secret-host", "SC-4", "BX-12",
  "deadbeef", "0123456789abcdef", "task-uuid-secret", "secret-db", "evt-secret", "fleet-backup", "/projects/", "bosun-x CLI"];

// Every key path allowed in the public JSON (arrays collapse to []).
const ALLOWED = new Set([
  "now", "publicView", "ships", "sailors", "happenings", "log",
  "ships[].key", "ships[].name", "ships[].kind", "ships[].todo", "ships[].inProgress",
  "sailors[].id", "sailors[].name", "sailors[].provider", "sailors[].ship", "sailors[].state", "sailors[].sub", "sailors[].since",
  "happenings[].id", "happenings[].kind", "happenings[].at", "happenings[].ship",
  "log.start", "log.end", "log.groups", "log.chores", "log.truncatedSince",
  "log.groups[].key", "log.groups[].name", "log.groups[].kind", "log.groups[].lanes",
  "log.groups[].lanes[].id", "log.groups[].lanes[].name", "log.groups[].lanes[].depth", "log.groups[].lanes[].state", "log.groups[].lanes[].segments",
  "log.groups[].lanes[].segments[].state", "log.groups[].lanes[].segments[].from", "log.groups[].lanes[].segments[].to",
  "log.chores[].id", "log.chores[].at", "log.chores[].outcome", "log.chores[].label",
]);
function keyPaths(value, prefix = "", out = new Set()) {
  if (Array.isArray(value)) for (const v of value) keyPaths(v, `${prefix}[]`, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p.replace(/\.(\w+)$/, (m) => m).replace(/^\./, ""));
    keyPaths(v, p, out);
  }
  return out;
}

test("public feed: no private string survives anywhere in the JSON", () => {
  const json = JSON.stringify(buildPortFeed(sources(), publicOpts));
  for (const secret of SECRETS) assert.ok(!json.includes(secret), `leaked: ${secret}`);
});

test("public feed: only whitelisted fields exist", () => {
  const paths = keyPaths(buildPortFeed(sources(), publicOpts));
  const extra = [...paths].filter((p) => !ALLOWED.has(p));
  assert.deepEqual(extra, [], `non-whitelisted fields: ${extra.join(", ")}`);
});

test("public feed: approved alias, anonymous voyages, a dinghy, voyage counts hidden", () => {
  const feed = buildPortFeed(sources(), publicOpts);
  const names = feed.ships.map((s) => `${s.kind}:${s.name}`).sort();
  assert.deepEqual(names, ["dinghy:Rowing boat", "project:Bosun CLI", "voyage:Private voyage 1", "voyage:Private voyage 2"]);
  const voyage = feed.ships.find((s) => s.kind === "voyage");
  assert.equal(voyage.todo, null);
  assert.equal(feed.ships.find((s) => s.kind === "project").todo, 3);
  const needs = feed.sailors.find((s) => s.state === "needs_approval");
  assert.equal(needs.ship, feed.ships.find((s) => s.name === "Private voyage 1").key, "private work still shows its state");
  assert.ok(feed.happenings.some((h) => h.kind === "cargo" && h.ship === needs.ship), "a private commit is anonymous cargo");
  assert.deepEqual(feed.log.chores.map((c) => c.label), ["harbour chore"]);
});

test("public feed: times rounded to the minute", () => {
  const feed = buildPortFeed(sources(), publicOpts);
  for (const s of feed.sailors) assert.match(s.since, /:00\.000Z$/);
  for (const h of feed.happenings) assert.match(h.at, /:00\.000Z$/);
  for (const g of feed.log.groups) for (const l of g.lanes) for (const s of l.segments) {
    assert.equal(s.from % MIN, 0);
    assert.equal(s.to % MIN, 0);
  }
});

test("identities and names are stable across refreshes, and the same on both pages", () => {
  const a = buildPortFeed(sources(), publicOpts);
  const b = buildPortFeed(sources(NOW + 10_000), publicOpts);
  assert.deepEqual(a.sailors.map((s) => [s.id, s.name, s.ship]), b.sailors.map((s) => [s.id, s.name, s.ship]));
  const priv = buildPortFeed(sources(), { publicView: false });
  assert.deepEqual(priv.sailors.map((s) => s.name).sort(), a.sailors.map((s) => s.name).sort(), "same sailor names privately and publicly");
  assert.deepEqual(priv.log.groups.map((g) => g.lanes.length).sort(), a.log.groups.map((g) => g.lanes.length).sort(), "same log shape");
});

test("private feed keeps the detail the operator needs", () => {
  const feed = buildPortFeed(sources(), { publicView: false });
  const needs = feed.sailors.find((s) => s.state === "needs_approval");
  assert.equal(needs.ship, "secret-client");
  assert.match(needs.detail, /sess-very-se.*SC-4/);
  assert.equal(needs.href, "/projects/secret-client#SC-4");
  assert.equal(feed.ships.find((s) => s.key === "secret-client").name, "Secret Client Portal");
  assert.ok(feed.happenings.every((h) => h.detail));
  const sub = feed.sailors.find((s) => s.sub);
  assert.equal(sub.name, "Codex 1");
  assert.equal(feed.log.groups.find((g) => g.key === "secret-client").lanes.find((l) => l.name === "Codex 1").depth, 1);
});

test("ships stay in port for 3 h after their last sign of life, not longer", () => {
  const feed = buildPortFeed(sources(), { publicView: false });
  assert.ok(feed.ships.some((s) => s.key === "another-private"), "finished 10 min ago: still moored");
  const later = buildPortFeed(sources(NOW + 4 * 60 * MIN), { publicView: false });
  assert.ok(!later.ships.some((s) => s.key === "another-private"), "gone after 3 h");
  assert.equal(later.happenings.length, 0, "happenings are only the last hour");
});
