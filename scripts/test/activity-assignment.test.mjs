import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/actions/activity-assignment.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const calls = [];
const member = { provider: "claude", key: "claude:session-1", project: "planner", task: "PLN-19", host: "laptop" };
const mocks = {
  "next/cache": { revalidatePath: () => calls.push("revalidate") },
  "@/auth": { auth: async () => null },
  "@/lib/auth-config": { isAuthEnabled: false, isAllowedEmail: async () => true },
  "@/lib/portal/mode": { PORTAL_MODE: false },
  "@/lib/activity": { readActivity: async () => ({ crew: [member] }) },
  "bosun-x/lib/activity.mjs": {
    resolveTaskKey: async (task) => ({ project: task === "PLN-19" ? "planner" : "bosun-x", task }),
    assignTask: async (input) => { calls.push("assign"); return { ...input, project: "bosun-x" }; },
  },
};
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => mocks[name], mod, mod.exports);
const form = (task) => new Map([["provider", "claude"], ["session", "session-1"], ["task", task]]);
const same = await mod.exports.assignSessionAction({}, form("PLN-19"));
assert.match(same.success, /already/);
assert.deepEqual(calls, [], "a task already shown in Crew must not emit another assignment");
const changed = await mod.exports.assignSessionAction({}, form("BX-17"));
assert.match(changed.success, /Assigned BX-17/);
assert.deepEqual(calls, ["assign", "revalidate"]);
console.log("activity assignment action passed");
