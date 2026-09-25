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
  return mod;
};
const stateModule = load("activity-state.ts", require);
const mod = load("activity.ts", (name) => name === "@/lib/data/paths" ? { DATA_DIR: "/tmp" }
  : name === "@/lib/data/tasks" ? { loadTasks: async () => [] }
  : name === "@/lib/activity-state" ? stateModule.exports : require(name));
const { projectActivity } = mod.exports;
const at = "2026-09-25T00:00:00.000Z";
const base = { v: 1, provider: "codex", session: "one", parent: null, turn: null, host: "dragonfly", project: "bosun-x", task: "BX-8", received: at };
const event = (id, kind, offset) => ({ ...base, id, kind, at: new Date(Date.parse(at) + offset).toISOString() });
const shuffled = [event("stop", "turn_stop", 3000), event("start", "turn_start", 0), event("approval", "approval_request", 2000), event("tool", "tool_start", 1000), event("approval", "approval_request", 2000)];
assert.equal(projectActivity(shuffled, Date.parse(at) + 4000)[0].state, "ready_for_prompt");
assert.equal(projectActivity(shuffled.slice(1), Date.parse(at) + 4000)[0].state, "needs_approval");
assert.equal(projectActivity([event("start", "turn_start", 0)], Date.parse(at) + 6 * 60_000)[0].state, "stale");
assert.equal(projectActivity([event("start", "turn_start", 0)], Date.parse(at) + 61 * 60_000)[0].state, "unknown");
assert.equal(projectActivity([...shuffled, event("end", "session_end", 4000)], Date.parse(at) + 61 * 60_000)[0].state, "finished");
console.log("activity state replay passed");
