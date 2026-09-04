#!/usr/bin/env node
// The handoff CLI lives in the bosun-x package now (github.com/x-hakt/bosun-x,
// extracted in CR-5). This wrapper only resolves the data directory and hands off
// to `bosun`.
//
//   npm run handoff -- start <slug> --agent <name> --summary <work> [--task <KEY>]
//   npm run handoff -- checkpoint … / finish … / resume <slug> / status / doctor [--fix]
//
// Data dir resolution (see scripts/lib/data-dir.mjs): $BOSUN_DATA / $DATA_DIR, else a
// `.bosun-data-path` file at the repo root, else a sibling ../bosun-x-data (or the
// legacy ../control-room-data), else ./data.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataDir } from "./lib/data-dir.mjs";

if (!process.env.BOSUN_DATA && !process.env.DATA_DIR) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  process.env.BOSUN_DATA = resolveDataDir(repoRoot);
}

await import("bosun-x/cli.mjs");
