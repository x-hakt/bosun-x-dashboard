#!/usr/bin/env node
// BXD-84: the ship's log (buildShipLog in src/lib/activity-state.ts), and its agreement
// with the roster (projectActivity in src/lib/activity.ts).
//   node scripts/test/ship-log.test.mjs
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
const activity = load("activity.ts", (name) => name === "@/lib/data/paths" ? { DATA_DIR: "/tmp" }
  : name === "@/lib/data/tasks" ? { loadTasks: async () => [] }
  : name === "@/lib/activity-state" ? state : require(name));
const { buildShipLog, STALE_MS, LOST_MS } = state;
const { projectActivity } = activity;

const T0 = Date.parse("2026-09-25T00:00:00.000Z");
const MIN = 60_000;
let n = 0;
const ev = (session, kind, minutes, extra = {}) => ({
  v: 1, id: `e${n++}`, provider: "claude", session, parent: null, turn: null, host: "caspar",
  project: "bosun-x", task: null, kind, at: new Date(T0 + minutes * MIN).toISOString(), received: new Date(T0 + minutes * MIN).toISOString(), ...extra,
});
const segs = (lane) => lane.segments.map((s) => [s.state, (s.from - T0) / MIN, (s.to - T0) / MIN]);
const lane = (log, session) => log.groups.flatMap((g) => g.lanes).find((l) => l.session === session);

test("states hold between events, go stale after 5 min of silence, and vanish after 60", () => {
  const events = [ev("a", "turn_start", 0), ev("a", "tool_start", 1), ev("a", "tool_end", 2), ev("a", "turn_stop", 3)];
  const log = buildShipLog(events, { start: T0 - 60 * MIN, end: T0 + 70 * MIN });
  assert.deepEqual(segs(lane(log, "a")), [
    ["working", 0, 1], ["waiting_for_tool", 1, 2], ["working", 2, 3], ["ready_for_prompt", 3, 8], ["stale", 8, 63],
  ]);
  assert.equal(lane(log, "a").state, "unknown");
  assert.equal(STALE_MS, 5 * MIN);
  assert.equal(LOST_MS, 60 * MIN);
});

test("heartbeats keep a state fresh; a finished session stops drawing", () => {
  const events = [ev("b", "turn_start", 0), ev("b", "heartbeat", 4), ev("b", "heartbeat", 8), ev("b", "session_end", 10)];
  const log = buildShipLog(events, { start: T0, end: T0 + 30 * MIN });
  assert.deepEqual(segs(lane(log, "b")), [["working", 0, 10]], "one merged bar, no stale gap");
  assert.equal(lane(log, "b").state, "finished");
});

test("the window clips bars, and a state set before it carries in", () => {
  const events = [ev("c", "approval_request", -2), ev("c", "turn_stop", 2)];
  const log = buildShipLog(events, { start: T0, end: T0 + 4 * MIN });
  assert.deepEqual(segs(lane(log, "c")), [["needs_approval", 0, 2], ["ready_for_prompt", 2, 4]]);
  const late = buildShipLog([ev("d", "turn_start", 10)], { start: T0, end: T0 + 5 * MIN });
  assert.equal(lane(late, "d"), undefined, "events after the window's end are ignored");
  const old = buildShipLog([ev("e", "session_start", -300), ev("e", "session_end", -290)], { start: T0, end: T0 + MIN });
  assert.equal(lane(old, "e"), undefined, "a session wholly before the window has no lane");
});

test("lanes group by project, unmapped apart, busiest group first, subagents under their parent", () => {
  const events = [
    ev("p1", "session_start", 0),
    ev("kid", "subagent_start", 1, { parent: "p1" }),
    ev("grandkid", "subagent_start", 2, { parent: "kid" }),
    ev("p2", "session_start", 0.5),
    ev("loose", "session_start", 5, { project: null }),
    ev("other", "session_start", 3, { project: "x-hakt" }),
  ];
  const log = buildShipLog(events, { start: T0, end: T0 + 6 * MIN });
  assert.deepEqual(log.groups.map((g) => g.project), [null, "x-hakt", "bosun-x"], "most recent activity first");
  assert.deepEqual(log.groups[2].lanes.map((l) => l.session), ["p1", "kid", "grandkid", "p2"]);
});

test("every lane ends in the roster's state, at any moment", () => {
  const events = [
    ev("r1", "session_start", 0), ev("r1", "tool_start", 3), ev("r1", "tool_end", 20), ev("r1", "approval_request", 21),
    ev("r1", "turn_stop", 30), ev("r1", "heartbeat", 33), ev("r1", "session_end", 120),
    ev("r2", "turn_start", 10, { provider: "codex" }), ev("r2", "interrupt", 12, { provider: "codex" }),
    ev("r3", "subagent_start", 4, { parent: "r1" }), ev("r3", "subagent_stop", 6, { parent: "r1" }),
  ];
  for (let m = 0; m <= 200; m += 1.5) {
    const end = T0 + m * MIN;
    const upTo = events.filter((e) => Date.parse(e.at) <= end);
    const roster = new Map(projectActivity(upTo, end).map((c) => [c.key, c.state]));
    const log = buildShipLog(events, { start: end - 24 * 60 * MIN, end });
    for (const l of log.groups.flatMap((g) => g.lanes)) assert.equal(l.state, roster.get(l.key), `${l.key} at +${m} min`);
    assert.equal(log.groups.flatMap((g) => g.lanes).length, roster.size, `same sessions at +${m} min`);
  }
});
