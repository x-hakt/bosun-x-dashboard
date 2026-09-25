# Crew activity (IDEA-20)

The operator's `/activity` page reads lifecycle events from `<DATA_DIR>/.activity/` (or `BOSUN_ACTIVITY_DIR`). This directory is runtime data: daily JSONL files, at most 8 MB/day, pruned after 14 days. Keep it outside version control. It is independent of the durable handoff/task records; a session can run without a handoff and two sessions can work on one project.

Install the optional hooks on machines where Claude Code or Codex runs. The packaged adapter is `hooks/activity.mjs` in bosun-x. Configure Claude Code's `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `SessionEnd`, `SubagentStart`, `SubagentStop` and `PostToolBatch` with `node /path/to/bosun-x/hooks/activity.mjs claude`. Configure the comparable Codex events with `... codex`. Use asynchronous command handlers except for SessionEnd where supported. Caspar's Codex 0.143 skips asynchronous handlers, so its installed Codex handlers are synchronous; `/hooks` now lists eight handlers for review there. Codex requires the hook definition to be reviewed and trusted through `/hooks` before it runs. The adapter sends only kind, session/turn IDs, host and a project matched from the working directory. Raw prompts and tool inputs are never sent. For a worktree or an agent launched outside its project path, set `BOSUN_PROJECT=<tracked-slug>` explicitly. Set `BOSUN_TASK=<project-task-key>` when launching an agent to attach all its events to a task; the collector validates that key against the project's task board. Workstation adapters reach Caspar over `ssh devserver`; failed deliveries spool under `~/.local/state/bosun-x/activity-spool/` for retry on a later event.

To enable the public ship, create `<DATA_DIR>/activity-public.json`:

```json
{
  "enabled": true,
  "projects": [
    { "slug": "bosun-x", "alias": "Bosun CLI" }
  ]
}
```

The public `/api/crew/public` response contains only numbered provider aliases, approved project aliases, broad state and minute-level update times. Its `fleet` array adds counts of to-do and in-progress tasks for approved projects, without task titles, IDs or private slugs. `/crew/embed` renders the same allowlisted projection, with `frame-ancestors https://x-hakt.com`. The client portal never serves either route. An empty allowlist shows a quiet deck. Review this JSON whenever new fields or adapters are added.

States are based on explicit events: tool start/end, permission request, turn stop and session end. A turn stop means ready for another prompt, not an urgent approval. An unanswered approval is shown separately. After five minutes without an observation an unfinished session is stale, then unknown after an hour. A heartbeat confirms observation, not useful work.

The operator view also places known scheduled jobs from the existing `_jobs` run markers on the recent timeline and shows their current status separately. These are not agent sessions and never enter the public feed. The ship's project buttons filter the visible crew without changing the underlying activity record; private crew stations link to their project or task.

An agent can also attach a known provider session to the task in a `bosun start` or `bosun checkpoint` call by passing `--session <id>` (or setting `BOSUN_SESSION_ID`). This emits an `assignment` event after the handoff write. It never guesses that a project-wide handoff belongs to every open session; when several task keys are carried, the first is the displayed primary task.

## Harbour and ship's log

With sessions on more than one project, **Harbour** shows each project as a small moored ship: sized by its open tasks, a red flag when someone aboard needs approval, crew on deck in the same poses as the main ship. Sessions with no project row about in a dinghy. Click a ship to board it (the full deck); **Harbour** returns. The private page moors every project seen in the last three hours; the public embed moors its approved aliases, never the dinghy.

The private **Ship's log** draws the last 24 hours as one lane per session, grouped by project, subagents under their parent: bars coloured by state, hatched once a signal goes stale (no event for five minutes), ending after an hour of silence or when the session finishes. Scheduled jobs are markers on their own row; the right edge is now. It replays the same state rules as the session list (`src/lib/activity-state.ts`), so a lane always ends in the state the roster shows. It reads the same bounded window as the page (the last 2000 events of three days) and says so if that cuts the day short.

## First live Codex signal

On dragonfly, open a terminal and run `codex`. At the Codex prompt, type `/hooks`, choose each configured event, inspect the Bosun command handler and trust it. The handler should invoke `node /home/thrax/devserver/unified-services/bosun-x/hooks/activity.mjs codex`. Repeat in a Codex session on Caspar (`ssh devserver`, then `codex`); there the path is `node /home/thrax/unified-services/bosun-x/hooks/activity.mjs codex`. `/hooks` is a Codex slash command, not a URL or a shell command. Codex will skip these user hooks until a person reviews and trusts the exact definition.

Start a **new** session within a tracked project directory. To attach a work order explicitly, for example run `BOSUN_PROJECT=bosun-x BOSUN_TASK=BX-10 codex` from the shell before entering Codex. The private `/activity` page shows the session, its task and current state. A public crew member appears only while an allowlisted project's signal is fresh. The ship still shows approved project task counts while all agents are offline. The page links to every outstanding IDEA-20 task in its relevant project.
