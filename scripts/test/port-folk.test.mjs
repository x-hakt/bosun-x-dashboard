#!/usr/bin/env node
// BXD-108: the street line-up outside the whorehouse (src/lib/port-folk.ts).
//   node --test scripts/test/port-folk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/port-folk.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { strumpetsFor, FOLK_WATCH_MS } = mod.exports;

const T = Date.parse("2026-09-28T10:00:00Z");

test("the same watch draws the same three, server and browser alike", () => {
  assert.deepEqual(strumpetsFor(T), strumpetsFor(T + 60_000));
  const line = strumpetsFor(T);
  assert.equal(line.length, 3);
  assert.equal(new Set(line.map((s) => s.name)).size, 3, "three different names");
  assert.equal(new Set(line.map((s) => s.name.split(" ")[1])).size, 3, "no two share a first name");
  assert.equal(new Set(line.map((s) => s.look.dress)).size, 3, "no two in the same dress");
});

test("a new watch, a new line-up; over a few days every look and Zoe and Rose turn up", () => {
  const watches = Array.from({ length: 60 }, (_, i) => strumpetsFor(T + i * FOLK_WATCH_MS));
  assert.notDeepEqual(watches[0], watches[1]);
  const girls = watches.flat();
  const firsts = new Set(girls.map((g) => g.name.split(" ")[1]));
  assert.ok(firsts.has("Zoe") && firsts.has("Rose"), "Zoe and Rose are in the rotation");
  assert.ok(firsts.size >= 20, `plenty of names in rotation (${firsts.size})`);
  for (const key of ["style", "accent", "skin", "hair"]) assert.ok(new Set(girls.map((g) => g.look[key])).size >= 4, `${key} varies`);
});
