# Crew activity (IDEA-20)

The operator's `/activity` page reads lifecycle events from `<DATA_DIR>/.activity/` (or `BOSUN_ACTIVITY_DIR`). This directory is runtime data: daily JSONL files, at most 8 MB/day, pruned after 14 days. Keep it outside version control. It is independent of the durable handoff/task records; a session can run without a handoff and two sessions can work on one project.

Install the optional hooks on machines where Claude Code or Codex runs. The packaged adapter is `hooks/activity.mjs` in bosun-x. Configure Claude Code's `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `SessionEnd`, `SubagentStart`, `SubagentStop` and `PostToolBatch` with `node /path/to/bosun-x/hooks/activity.mjs claude`. Configure the comparable Codex events with `... codex`. Use asynchronous command handlers except for SessionEnd. Codex requires the hook definition to be reviewed and trusted through `/hooks` before it runs. The adapter sends only kind, session/turn IDs, host and a project matched from the working directory. Raw prompts and tool inputs are never sent. Workstation adapters reach Caspar over `ssh devserver`; failed deliveries spool under `~/.local/state/bosun-x/activity-spool/` for retry on a later event.

To enable the public ship, create `<DATA_DIR>/activity-public.json`:

```json
{
  "enabled": true,
  "projects": [
    { "slug": "bosun-x", "alias": "Bosun CLI" }
  ]
}
```

The public `/api/crew/public` response contains only numbered provider aliases, approved project aliases, broad state and minute-level update times. `/crew/embed` renders the same allowlisted projection, with `frame-ancestors https://x-hakt.com`. The client portal never serves either route. An empty allowlist shows a quiet deck. Review this JSON whenever new fields or adapters are added.

States are based on explicit events: tool start/end, permission request, turn stop and session end. A turn stop means ready for another prompt, not an urgent approval. An unanswered approval is shown separately. After five minutes without an observation an unfinished session is stale, then unknown after an hour. A heartbeat confirms observation, not useful work.
