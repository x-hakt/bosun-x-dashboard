#!/usr/bin/env node
// BXD-85, BXD-89..93: port geometry, walks and the camera (src/lib/port-layout.ts).
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
const { layoutBerths, assignSpots, planWalk, pointOf, errandRoute, cameraFor, HARBOUR_CAMERA, QUAY_Y, MAX_BERTHS, PORT_W, PORT_H, TOWN_EXIT, DINGHY, MOORING_ROWS, TAVERN_DOOR, WAREHOUSE_DOOR } = mod.exports;
const keys = (n, p = "s") => Array.from({ length: n }, (_, i) => `${p}${i}`);

test("active ships fit the quay without overlapping; extras join the moorings", () => {
  for (let n = 1; n <= MAX_BERTHS + 2; n++) {
    const berths = layoutBerths(keys(n), keys(3, "q"));
    const quay = berths.filter((b) => !b.moored);
    assert.equal(quay.length, Math.min(n, MAX_BERTHS));
    assert.equal(berths.filter((b) => b.moored).length, 3 + Math.max(0, n - MAX_BERTHS));
    for (const b of quay) {
      assert.ok(b.cx - 105 * b.scale >= 440 && b.cx + 105 * b.scale <= PORT_W, `ship ${b.key} of ${n} inside the harbour`);
      assert.equal(b.plankFoot.y, QUAY_Y);
    }
    for (let i = 1; i < quay.length; i++) assert.ok(quay[i].cx - quay[i - 1].cx >= 210 * quay[i].scale, `${n} ships: no overlap`);
  }
});

test("twenty quiet ships ride at moorings in the bay, apart, in the frame", () => {
  const berths = layoutBerths(keys(2), keys(20, "q"));
  const moored = berths.filter((b) => b.moored);
  assert.equal(moored.length, 20);
  for (const b of moored) {
    assert.ok(b.cx - 105 * b.scale >= 600 && b.cx + 105 * b.scale <= PORT_W, `${b.key} inside`);
    assert.ok(b.waterline <= PORT_H && b.waterline - 270 * b.scale > QUAY_Y + 30, `${b.key} below the quay, masts clear of it`);
  }
  for (const row of MOORING_ROWS) {
    const inRow = moored.filter((b) => b.waterline === row.waterline).sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < inRow.length; i++) assert.ok(inRow[i].cx - inRow[i - 1].cx >= 214 * row.scale, "neighbours in a row don't touch");
  }
  const same = layoutBerths(keys(2), keys(20, "q"));
  assert.deepEqual(same, berths, "stable");
});

test("states map to places: work on deck, ready at the tavern, needs-you on the quay, stale dozing, rowing-boat crew seated", () => {
  const berths = layoutBerths(["a", "b"]);
  const spots = assignSpots([
    { id: "1", ship: "a", state: "working" },
    { id: "2", ship: "a", state: "waiting_for_tool" },
    { id: "3", ship: "a", state: "ready_for_prompt" },
    { id: "4", ship: "a", state: "needs_approval" },
    { id: "5", ship: "b", state: "stale" },
    { id: "6", ship: "~dinghy", state: "working" },
    { id: "7", ship: "~dinghy", state: "stale" },
  ], berths, "~dinghy");
  assert.deepEqual([spots.get("1").spot.zone, spots.get("1").pose], ["deck", "haul"]);
  assert.equal(spots.get("2").pose, "fire");
  assert.deepEqual([spots.get("3").spot.zone, spots.get("3").pose], ["tavern", "drink"]);
  assert.ok(Math.abs(pointOf(spots.get("3").spot, berths).x - TAVERN_DOOR.x) < 70, "sat outside the tavern");
  assert.deepEqual([spots.get("4").spot.zone, spots.get("4").pose], ["quay", "call"]);
  assert.deepEqual([spots.get("5").spot.zone, spots.get("5").pose], ["deck", "doze"]);
  assert.deepEqual([spots.get("6").spot.zone, spots.get("7").pose], ["dinghy", "doze"]);
  for (const p of spots.values()) assert.notEqual(p.pose, "sleep", "nobody lies on their side");
  const seat = pointOf(spots.get("6").spot, berths);
  assert.ok(Math.abs(seat.x - DINGHY.x) <= 30 && seat.y > DINGHY.y, "sat inside the boat");
  const again = assignSpots([{ id: "3", ship: "a", state: "ready_for_prompt" }, { id: "1", ship: "a", state: "working" }], berths, "~dinghy");
  assert.deepEqual(again.get("1"), spots.get("1"), "same crew, same places, whatever the input order");
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
  assert.deepEqual(planWalk({ zone: "quay", x: 900 }, { zone: "town" }, berths), [{ ...TOWN_EXIT, s: 1 }]);
  assert.equal(planWalk({ zone: "deck", ship: "a", x: 1 }, { zone: "deck", ship: "a", x: 2 }, berths).length, 1);
  const toBoat = planWalk({ zone: "town" }, { zone: "dinghy", x: DINGHY.x }, berths);
  assert.equal(toBoat[0].x, DINGHY.stairsX, "down the stairs to the rowing boat");
});

test("errands start and end at the warehouse; cargo goes up the plank and down the hatch", () => {
  const berths = layoutBerths(["a"]);
  const { route, handover } = errandRoute("cargo", berths, "a");
  assert.equal(route[0].x, WAREHOUSE_DOOR.x);
  assert.equal(route.at(-1).x, WAREHOUSE_DOOR.x);
  assert.deepEqual([route[1].x, route[2].x], [berths[0].plankFoot.x, berths[0].plankTop.x], "up the gangplank");
  assert.deepEqual([route[handover].x, route[handover].y], [berths[0].hatch.x, berths[0].hatch.y], "hands over at the hatch");
  const cart = errandRoute("cart", berths, "a");
  assert.equal(cart.route[cart.handover].x, berths[0].plankFoot.x, "carts wait at the foot of the plank");
  assert.equal(errandRoute("tide", berths).route.length, 3);
  assert.equal(errandRoute("cargo", berths, "gone").route.length, 3, "a ship that left: to the quay and back");
});

test("walking to the tavern goes down the plank and along the quay", () => {
  const berths = layoutBerths(["a"]);
  const walk = planWalk({ zone: "deck", ship: "a", x: berths[0].cx }, { zone: "tavern", x: TAVERN_DOOR.x }, berths);
  assert.deepEqual(walk.map((p) => Math.round(p.x)), [berths[0].plankTop.x, berths[0].plankFoot.x, TAVERN_DOOR.x].map(Math.round));
  assert.equal(walk.at(-1).y, QUAY_Y);
});

test("the camera frames a ship at the port's aspect ratio, inside the port", () => {
  const berths = layoutBerths(keys(3), keys(12, "q"));
  const ratio = PORT_W / PORT_H;
  assert.deepEqual(cameraFor(null, berths, "~dinghy"), HARBOUR_CAMERA);
  for (const key of [...berths.map((b) => b.key), "~dinghy"]) {
    const c = cameraFor(key, berths, "~dinghy");
    assert.ok(Math.abs(c.w / c.h - ratio) < 1e-9, `${key}: same aspect`);
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= PORT_W + 1e-9 && c.y + c.h <= PORT_H + 1e-9, `${key}: inside`);
    assert.ok(c.w < PORT_W, `${key}: zoomed in`);
    const b = berths.find((x) => x.key === key);
    if (b) assert.ok(b.cx >= c.x && b.cx <= c.x + c.w, `${key}: in view`);
  }
  assert.deepEqual(cameraFor("gone", berths, "~dinghy"), HARBOUR_CAMERA, "a ship that left: back to the harbour");
});
