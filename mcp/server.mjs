#!/usr/bin/env node
// The MCP server lives in the bosun-x package now (github.com/x-hakt/bosun-x).
// This wrapper only resolves the data directory the same way the handoff CLI does,
// then starts `bosun-mcp`.
//
// Wire it into a client as: { "command": "node", "args": [".../mcp/server.mjs"] }
// — or point straight at bosun-x/mcp/server.mjs with BOSUN_DATA set.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataDir } from "../scripts/lib/data-dir.mjs";

if (!process.env.BOSUN_DATA && !process.env.DATA_DIR) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  process.env.BOSUN_DATA = resolveDataDir(repoRoot);
}

await import("bosun-x/mcp/server.mjs");
