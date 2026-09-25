#!/usr/bin/env node
// BXD-81: unit tests for the pure crew layout (src/lib/crew-scene.ts).
//   node scripts/test/crew-scene.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/crew-scene.ts"), "utf-8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "crew-scene-test-")), "crew-scene.mjs");
fs.writeFileSync(tmp, outputText);
const { stationFor, layoutCrew, SLOTS, poseFor } = await import(pathToFileURL(tmp).href);

test("each observed state has its station; finished and unknown are off deck", () => {
  assert.equal(stationFor("working"), "rigging");
  assert.equal(stationFor("waiting_for_tool"), "cannons");
  assert.equal(stationFor("needs_approval"), "cabin");
  assert.equal(stationFor("ready_for_prompt"), "bow");
  assert.equal(stationFor("stale"), "berth");
  assert.equal(stationFor("finished"), null);
  assert.equal(stationFor("unknown"), null);
});

test("members fill their station's slots in order, with the station pose", () => {
  const { placed, overflow } = layoutCrew([
    { id: "a", state: "working" }, { id: "b", state: "needs_approval" }, { id: "c", state: "working" }, { id: "d", state: "finished" },
  ]);
  assert.deepEqual(placed.map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual([placed[0].x, placed[0].y, placed[0].pose], [SLOTS.rigging[0].x, SLOTS.rigging[0].y, "haul"]);
  assert.equal(placed[1].pose, "call");
  assert.equal(placed[2].x, SLOTS.rigging[1].x);
  assert.equal(overflow.length, 0);
});

test("a slot's own pose wins (the third hand climbs the mast)", () => {
  const { placed } = layoutCrew(["a", "b", "c"].map((id) => ({ id, state: "working" })));
  assert.equal(placed[2].pose, "climb");
});

test("subagents are drawn smaller", () => {
  const { placed } = layoutCrew([{ id: "a", state: "working" }, { id: "b", state: "working", sub: true }]);
  assert.equal(placed[0].scale, 1);
  assert.ok(placed[1].scale < 1);
});

test("a full station collapses the rest into one +n marker above its last slot", () => {
  const n = SLOTS.cabin.length + 3;
  const { placed, overflow } = layoutCrew(Array.from({ length: n }, (_, i) => ({ id: String(i), state: "needs_approval" })));
  assert.equal(placed.length, SLOTS.cabin.length);
  assert.equal(overflow.length, 1);
  const last = SLOTS.cabin.at(-1);
  assert.deepEqual(overflow[0], { station: "cabin", x: last.x, y: last.y - 64, count: 3 });
});

test("no two placed members share a slot", () => {
  const states = ["working", "waiting_for_tool", "needs_approval", "ready_for_prompt", "stale"];
  const { placed } = layoutCrew(Array.from({ length: 40 }, (_, i) => ({ id: String(i), state: states[i % 5] })));
  const spots = new Set(placed.map((p) => `${p.x},${p.y}`));
  assert.equal(spots.size, placed.length);
});

test("close neighbours get alternating nameplate rows", () => {
  const { placed } = layoutCrew(Array.from({ length: 4 }, (_, i) => ({ id: String(i), state: "ready_for_prompt" })));
  const tiers = [...placed].sort((a, b) => a.x - b.x).map((p) => p.tier);
  for (let i = 1; i < tiers.length; i++) assert.notEqual(tiers[i], tiers[i - 1]);
});

test("harbour poses follow the deck's stations (BXD-82)", () => {
  assert.equal(poseFor("working"), "haul");
  assert.equal(poseFor("needs_approval"), "call");
  assert.equal(poseFor("stale"), "sleep");
  assert.equal(poseFor("finished"), null);
});
