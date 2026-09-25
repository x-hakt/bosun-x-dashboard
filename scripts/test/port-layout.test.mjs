#!/usr/bin/env node
// BXD-85: port geometry and walks (src/lib/port-layout.ts).
//   node scripts/test/port-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../../src/lib/port-layout.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { layoutBerths, assignSpots, planWalk, pointOf, errandRoute, QUAY_Y, MAX_BERTHS, PORT_W, TOWN_EXIT } = mod.exports;

test("berths fit the quay and never overlap; extras ride at anchor on the horizon", () => {
  for (let n = 1; n <= 9; n++) {
    const berths = layoutBerths(Array.from({ length: n }, (_, i) => `s${i}`));
    const moored = berths.filter((b) => !b.offing);
    assert.equal(moored.length, Math.min(n, MAX_BERTHS));
    assert.equal(berths.filter((b) => b.offing).length, Math.max(0, n - MAX_BERTHS));
    for (const b of moored) {
      assert.ok(b.cx - 105 * b.scale >= 440 && b.cx + 105 * b.scale <= PORT_W, `ship ${b.key} of ${n} inside the harbour`);
      assert.equal(b.plankFoot.y, QUAY_Y);
    }
    for (let i = 1; i < moored.length; i++) assert.ok(moored[i].cx - moored[i - 1].cx >= 210 * moored[i].scale, `${n} ships: no overlap`);
  }
});

test("states map to places: work on deck, ready and needs-you on the quay, stale asleep aboard", () => {
  const berths = layoutBerths(["a", "b"]);
  const spots = assignSpots([
    { id: "1", ship: "a", state: "working" },
    { id: "2", ship: "a", state: "waiting_for_tool" },
    { id: "3", ship: "a", state: "ready_for_prompt" },
    { id: "4", ship: "a", state: "needs_approval" },
    { id: "5", ship: "b", state: "stale" },
    { id: "6", ship: "~dinghy", state: "working" },
  ], berths, "~dinghy");
  assert.deepEqual([spots.get("1").spot.zone, spots.get("1").pose], ["deck", "haul"]);
  assert.equal(spots.get("2").pose, "fire");
  assert.deepEqual([spots.get("3").spot.zone, spots.get("3").pose], ["quay", "rest"]);
  assert.deepEqual([spots.get("4").spot.zone, spots.get("4").pose], ["quay", "call"]);
  assert.deepEqual([spots.get("5").spot.zone, spots.get("5").pose], ["deck", "sleep"]);
  assert.equal(spots.get("6").spot.zone, "dinghy");
  const again = assignSpots([{ id: "3", ship: "a", state: "ready_for_prompt" }, { id: "1", ship: "a", state: "working" }], berths, "~dinghy");
  assert.deepEqual(again.get("1"), spots.get("1"), "same crew, same places, whatever the input order");
});

test("sailors on a ship anchored out on the horizon are not drawn", () => {
  const keys = Array.from({ length: MAX_BERTHS + 1 }, (_, i) => `s${i}`);
  const spots = assignSpots([{ id: "x", ship: keys.at(-1), state: "working" }], layoutBerths(keys), "~dinghy");
  assert.equal(spots.has("x"), false);
});

test("walks go down one gangplank, along the quay, and up the other", () => {
  const berths = layoutBerths(["a", "b"]);
  const [a, b] = berths;
  const walk = planWalk({ zone: "deck", ship: "a", x: a.cx }, { zone: "deck", ship: "b", x: b.cx }, berths);
  assert.deepEqual(walk.map((p) => [Math.round(p.x), Math.round(p.y)]), [
    [a.plankTop.x, a.plankTop.y], [a.plankFoot.x, QUAY_Y], [b.plankFoot.x, QUAY_Y], [b.plankTop.x, b.plankTop.y], [b.cx, b.deckY],
  ].map(([x, y]) => [Math.round(x), Math.round(y)]));
  const arrive = planWalk({ zone: "town" }, { zone: "deck", ship: "a", x: a.cx }, berths);
  assert.equal(arrive[0].x, a.plankFoot.x, "from town: straight along the quay to the plank");
  const leave = planWalk({ zone: "quay", x: 900 }, { zone: "town" }, berths);
  assert.deepEqual(leave, [{ ...TOWN_EXIT, s: 1 }]);
  const same = planWalk({ zone: "deck", ship: "a", x: 1 }, { zone: "deck", ship: "a", x: 2 }, berths);
  assert.equal(same.length, 1, "moving about the same deck is one step");
  const gone = planWalk({ zone: "deck", ship: "gone", x: 5 }, { zone: "town" }, berths);
  assert.deepEqual(gone, [pointOf({ zone: "town" }, berths)], "a ship that sailed: straight off");
});

test("errands start and end at the warehouse or office", () => {
  const berths = layoutBerths(["a"]);
  const cargo = errandRoute("cargo", berths, "a");
  assert.equal(cargo[0].x, cargo.at(-1).x);
  assert.equal(cargo[1].x, berths[0].plankFoot.x);
  assert.equal(errandRoute("tide", berths).length, 3);
});
