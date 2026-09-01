#!/usr/bin/env node
// The MCP server lives in the bosun-x package now (github.com/x-hakt/bosun-x).
// This wrapper only resolves Control Room's data directory the same way the
// handoff CLI does, then starts `bosun-mcp`.
//
// Wire it into a client as: { "command": "node", "args": [".../mcp/server.mjs"] }
// — or point straight at bosun-x/mcp/server.mjs with BOSUN_DATA set.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.BOSUN_DATA && !process.env.DATA_DIR) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const production = path.join(path.dirname(repoRoot), "control-room-data");
  process.env.BOSUN_DATA = fs.existsSync(production) ? production : path.join(repoRoot, "data");
}

await import("bosun-x/mcp/server.mjs");
