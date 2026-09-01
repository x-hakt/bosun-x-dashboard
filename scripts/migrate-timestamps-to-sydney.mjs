#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { sydneyIsoTimestamp } from "./sydney-time.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const productionDataDir = path.join(path.dirname(repoRoot), "control-room-data");
const dataDir = process.env.DATA_DIR || await fs.access(productionDataDir)
  .then(() => productionDataDir)
  .catch(() => path.join(repoRoot, "data"));
const timestampPattern = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
const allowedExtensions = new Set([".md", ".yml", ".yaml", ".json"]);

async function filesBelow(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await filesBelow(target));
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) found.push(target);
  }
  return found;
}

let changedFiles = 0;
let changedTimestamps = 0;
for (const file of await filesBelow(dataDir)) {
  const current = await fs.readFile(file, "utf8");
  let replacements = 0;
  const next = current.replace(timestampPattern, (value) => {
    replacements += 1;
    return sydneyIsoTimestamp(new Date(value));
  });
  if (!replacements) continue;
  await fs.writeFile(file, next, "utf8");
  changedFiles += 1;
  changedTimestamps += replacements;
}
console.log(`Converted ${changedTimestamps} timestamps in ${changedFiles} files to Australia/Sydney offsets.`);
