#!/usr/bin/env node
// The handoff CLI lives in the bosun-x package now (github.com/x-hakt/bosun-x,
// extracted in CR-5). This wrapper only resolves Control Room's data directory —
// ../control-room-data in production, else ./data — and hands off to `bosun`.
//
//   npm run handoff -- start <slug> --agent <name> --summary <work> [--task <KEY>]
//   npm run handoff -- checkpoint … / finish … / resume <slug> / status / doctor [--fix]
//
// Set DATA_DIR (or BOSUN_DATA) to point somewhere else.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.BOSUN_DATA && !process.env.DATA_DIR) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const production = path.join(path.dirname(repoRoot), "control-room-data");
  process.env.BOSUN_DATA = fs.existsSync(production) ? production : path.join(repoRoot, "data");
}

await import("bosun-x/cli.mjs");
