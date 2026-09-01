# bosun-x — MCP server

A stdio [MCP](https://modelcontextprotocol.io) server that exposes the handoff CLI
and Control Room's project/task data as tools, so any MCP client — Claude Code,
Claude Desktop, Codex, Cursor, Cline, Zed — can drive the workflow without
shelling out or hand-editing YAML.

The server itself is the [`bosun-x`](https://github.com/x-hakt/bosun-x) package;
`mcp/server.mjs` here is a one-line wrapper that points it at `../control-room-data`.
It's a thin layer: handoff writes go through the `bosun` CLI (the one lock holder),
task-status edits reuse `bosun-x`'s `lib/board.mjs` so `tasks.yml` keeps its
formatting and the `STATUS.md` board stays current, and reads are direct.

## Tools

| tool | what it does |
| --- | --- |
| `project_brief` | everything to pick up a project in one blob: metadata, `SPEC.md`, the resume snapshot, open tasks, the task board. **Call this at session start.** |
| `list_projects` | every project with stage, status, host, handoff state, task counts |
| `list_tasks` | a project's tasks, optionally by status |
| `handoff_resume` | the bounded resume snapshot for one project |
| `handoff_status` | one-line active / stale / finished per project |
| `handoff_start` / `handoff_checkpoint` / `handoff_finish` | the handoff loop; pass `task` so the board tracks it |
| `handoff_doctor` | report task/handoff drift and stale boards; `fix: true` reconciles |
| `set_task_status` | move a task to backlog / todo / in_progress / done |
| `create_task` | append a task (status backlog) and refresh the board |

## Run it

```
node /ABS/PATH/TO/control-room/mcp/server.mjs
```

It reads the data dir the same way the CLI does: `$DATA_DIR`, else
`../control-room-data`, else `./data`.

## Wire it into a client

**Claude Code** — add to `.mcp.json` in a repo, or `~/.claude.json`:

```json
{
  "mcpServers": {
    "bosun-x": {
      "command": "node",
      "args": ["/ABS/PATH/TO/control-room/mcp/server.mjs"],
      "env": { "DATA_DIR": "/ABS/PATH/TO/control-room-data" }
    }
  }
}
```

**Claude Desktop** — the same block in
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows).

**Cursor / Cline / Zed / Codex** — each takes the same `command` + `args` + `env`
shape in its MCP settings.

## Also drop the convention into your repos

```
node /ABS/PATH/TO/control-room/scripts/handoff.mjs init
```

(or `npx bosun init` once it's on npm) adds a managed `<!-- bosun-x -->` block to
whichever of `CLAUDE.md`, `AGENTS.md`,
`.cursorrules`, or `.github/copilot-instructions.md` already exists — the
checkpoint discipline in a few lines, re-run to update in place.
