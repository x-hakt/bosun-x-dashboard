#!/usr/bin/env node
// One-off: assign a stable `num` to every task that lacks one (in file order, which is
// creation order) and set the file's `seq` counter to the highest number issued.
// Idempotent — tasks that already have a num keep it, seq only ever grows.

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const productionDataDir = path.join(path.dirname(repoRoot), "control-room-data");
const dataDir = process.env.DATA_DIR || await fs.access(productionDataDir)
  .then(() => productionDataDir)
  .catch(() => path.join(repoRoot, "data"));
const projectsDir = path.join(dataDir, "projects");

let changedFiles = 0;
let numbered = 0;
for (const entry of await fs.readdir(projectsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(projectsDir, entry.name, "tasks.yml");
  let parsed;
  try {
    parsed = loadYaml(await fs.readFile(file, "utf8"));
  } catch {
    continue;
  }
  if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) continue;

  let seq = Number.isInteger(parsed.seq) ? parsed.seq : 0;
  seq = Math.max(seq, ...parsed.tasks.map((task) => (Number.isInteger(task.num) ? task.num : 0)));
  let touched = false;
  const tasks = parsed.tasks.map((task) => {
    if (Number.isInteger(task.num)) return task;
    seq += 1;
    numbered += 1;
    touched = true;
    // Rebuild with num right after id so the YAML stays readable.
    const { id, ...rest } = task;
    return { id, num: seq, ...rest };
  });

  if (!touched && parsed.seq === seq) continue;
  await fs.writeFile(file, dumpYaml({ seq, tasks }), "utf8");
  changedFiles += 1;
}

console.log(`Numbered ${numbered} task(s) across ${changedFiles} file(s).`);
