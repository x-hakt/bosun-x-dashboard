# Crew activity (IDEA-20)

The operator's `/activity` page reads lifecycle events from `<DATA_DIR>/.activity/` (or `BOSUN_ACTIVITY_DIR`). This directory is runtime data: daily JSONL files, at most 8 MB/day, pruned after 14 days. Keep it outside version control. It is independent of the durable handoff/task records; a session can run without a handoff and two sessions can work on one project.

Install the optional hooks on machines where Claude Code or Codex runs. The packaged adapter is `hooks/activity.mjs` in bosun-x. Configure Claude Code's `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `SessionEnd`, `SubagentStart`, `SubagentStop` and `PostToolBatch` with `node /path/to/bosun-x/hooks/activity.mjs claude`. Configure the comparable Codex events with `... codex`. Use asynchronous command handlers except for SessionEnd where supported. Codex 0.143 skips asynchronous handlers, so on a machine running that version install the Codex handlers as synchronous; `/hooks` then lists eight handlers for review. Codex requires the hook definition to be reviewed and trusted through `/hooks` before it runs. The adapter sends only kind, session/turn IDs, host and a project matched from the working directory. Raw prompts and tool inputs are never sent. For a worktree or an agent launched outside its project path, set `BOSUN_PROJECT=<tracked-slug>` explicitly. Set `BOSUN_TASK=<project-task-key>` when launching an agent to attach all its events to a task; the collector validates that key against the project's task board. A workstation that reads the server's bosun-x checkout through a network mount (sshfs, say) needs one small file beside that checkout, `activity.local.json` (never committed), mapping the mount to the server and naming the SSH alias: `{ "mounts": [{ "local": "/home/me/server/", "remote": "/home/me/", "ssh": "my-server" }] }`. Events are then delivered by running the server's own CLI over that SSH alias, and working directories under the mount are matched as the server's paths. `BOSUN_ACTIVITY_CONFIG` points at the file instead if it lives elsewhere. Failed deliveries spool under `~/.local/state/bosun-x/activity-spool/` for retry on a later event.

To enable the public ship, create `<DATA_DIR>/activity-public.json`:

```json
{
  "enabled": true,
  "projects": [
    { "slug": "bosun-x", "alias": "Bosun CLI" }
  ]
}
```

Add `"allProjects": true` to name every tracked project by its display name (listed aliases still win). Without it, projects not listed appear publicly as anonymous numbered private voyages.

The public `/api/crew/public` response is the same port feed the embed renders (`publicPortFeed()` in `src/lib/port-feed.ts`, built by `buildPortFeed()` in `src/lib/port-core.ts`), written field by field from a whitelist. Approved projects appear under their alias with to-do and in-progress counts. Any other project with recent activity appears as a numbered **private voyage**: state and timing only, no name, counts, task or host. Sessions carry generated sailor names (`Salty Meg`, from a hash of the session key and the current 4-hour watch, the same as on `/activity`) and opaque HMAC ids (keyed by `AUTH_SECRET`); times are rounded to the minute; commits, finished tasks, backups and tide readings are generic errands with no names; scheduled jobs on the log are "harbour chores". `scripts/test/port-feed.test.mjs` fails if a private string or a non-whitelisted field reaches the public JSON. `/crew/embed` renders the port and ship's log from it, with `frame-ancestors https://x-hakt.com`, and posts its height to that page so the iframe fits. The client portal never serves either route. With `enabled: false` (or no file) the public feed is empty: no voyages either.

States are based on explicit events: tool start/end, permission request, turn stop and session end. A turn stop means ready for another prompt, not an urgent approval. An unanswered approval is shown separately. After five minutes without an observation an unfinished session is stale, then unknown after an hour. A heartbeat confirms observation, not useful work.

The operator view also places known scheduled jobs from the existing `_jobs` run markers on the recent timeline and shows their current status separately. These are not agent sessions and never enter the public feed. The ship's project buttons filter the visible crew without changing the underlying activity record; private crew stations link to their project or task.

An agent can also attach a known provider session to the task in a `bosun start` or `bosun checkpoint` call by passing `--session <id>` (or setting `BOSUN_SESSION_ID`). This emits an `assignment` event after the handoff write. It never guesses that a project-wide handoff belongs to every open session; when several task keys are carried, the first is the displayed primary task.

## The port, the ship's log and the watch bill

`/activity` and `/crew/embed` render the same three things from the private or public feed, in the same order.

**The port** (`src/components/port-scene.tsx`). Every tracked project is a ship. Ships with crew aboard or any sign of life in the last three hours (a session, a commit, a finished task, a backup) are at the quay with sails set; the rest ride at their moorings in the bay, sails furled, in a stable order with their names beside them. Each ship has its own hull, stripe and sail colours and its own Jolly Roger, fixed per project (a style seed in the feed; an anonymous voyage's comes from its number, so its flag can't be matched to a project). Sessions with no project are in the rowing boat. **Sailors are live sessions**: pirates, each with a generated name (`Salty Meg`, from a hash of the session key, re-drawn every 4-hour watch) and a look from that name (hat, shirt, beard, eyepatch), the same on both pages; a sash in the model's colour (Claude orange, Codex teal). They walk when their state changes: a new session walks in from town and up the gangplank; a working one stays on deck, hauling cargo between its post and the hatch (at a gun while a tool runs); a ready one sits outside the tavern, The Plastered Bastard, with an ale, waiting for orders; one that needs you waves on the quay while the ship flies a red "!" pennant; a stale one dozes where it is; a finished one walks into the tavern. Everyone in the port wears a nameplate all the time. **Dockhands and the shipwright run real errands** from the last hour, each dockhand named: a crate carried up the gangplank and down the hatch for each commit, a crate brought up and off to the whorehouse (and a pennant) for each task moved to done, a cart of barrels to the whorehouse for each backup, the shipwright walking out to the tide pole for each 5-minute capacity sample (he lights its lamp on one reading and takes it down on the next, strolls a little, then goes back inside his shop), the office bell for each approval request. **Townsfolk run the server's scheduled jobs**: every cron run is an errand walked by its trade, the lamplighter (certificates), the courier (syncs and imports), the warehouse hand (backups), the watchman (health checks), the sweeper (cleanups) and the clerk (records and stats); a job that runs every few minutes sends someone out at most every 20 minutes, and a failed run always walks. **Strumpets outside the whorehouse, mermaids in the bay, gulls, clouds, smoke, the lighthouse and the sky** (day, dusk, night by Sydney time) are scenery. Click a ship, its sign or its mooring to board it: the camera glides in and a card lists who's aboard and the ship's latest log lines. Reduced motion places everyone with no walks, errands or glides.

**The ship's log** (`src/components/rolling-log.tsx`) is the last 24 hours as short lines across every ship, oldest at the top and newest at the bottom: sailors going aboard, getting to work, waiting on the captain, getting the nod, stepping ashore and signing off; dockhands loading crates; pennants for finished tasks; carts to the whorehouse; townsfolk back from a scheduled job (one line per job per 3 hours unless it failed). Tool calls are not logged line by line, and several crates or pennants for one ship in the same minute read as one line.

**The watch bill** (`src/components/ship-log.tsx`) draws the same day as one lane per sailor, grouped by ship, subagents under their parent: bars coloured by state, hatched once a signal goes stale (no event for five minutes), ending after an hour of silence or when the session finishes. Scheduled jobs are diamonds on one row per trade (every run, thinned to one ok mark per job per half hour; failures always shown); the right edge is now. It replays the same state rules as the session list (`src/lib/activity-state.ts`), so a lane always ends in the state the roster shows.

Finished sessions shorter than a minute (hook smoke tests, one-shot commands) are left off both. Both read the same bounded window as the page (the last 2000 events of three days); the watch bill says so if that cuts the day short.

## First live Codex signal

On a workstation, open a terminal and run `codex`. At the Codex prompt, type `/hooks`, choose each configured event, inspect the Bosun command handler and trust it. The handler should invoke `node /path/to/bosun-x/hooks/activity.mjs codex` (the mounted checkout's path on a workstation). Repeat in a Codex session on the server itself, where the path is the server's own checkout. `/hooks` is a Codex slash command, not a URL or a shell command. Codex will skip these user hooks until a person reviews and trusts the exact definition.

The agent can stay in one long-lived session and assign itself a task through Bosun:
`bosun assign BX-13`. Bosun resolves the project from that key and associates it
with the current Codex/Claude session; repeat when the task changes or a new task
is created. `handoff_start`/`checkpoint --task` also assign automatically when the
current provider session ID is available. If it is not, use `--provider` and
`--session`, the `activity_assign` MCP tool, or the private `/activity` page's
**Set current task** control. Project-folder launches and `BOSUN_PROJECT` /
`BOSUN_TASK` remain optional fallbacks. The hooks never inspect the user's prompt.
The private `/activity` page shows each session's task and current state. A public
crew member appears only while an allowlisted project's signal is fresh. The ship
still shows approved project task counts while all agents are offline.

When a validated agent event already contains a task and project, Bosun remembers
that association for the rest of the session. The private roster displays the
known task and offers **Correct task if wrong**; **Set current task** appears only
when the task is unknown. Submitting the same task again changes nothing.

## Scheduled jobs in the port (BXD-94)

Every run of every scheduled job lands in `<receipts>/_jobs/runs.jsonl` (one line per finished run: job, label, family, start, finish, exit; no output), trimmed to the newest 6000 lines once it passes 1.5 MB. The fleet scripts write it through `scripts/lib/job-marker.sh` as before. Any other crontab line gets the same markers by running through the wrapper, which leaves the command and its output alone and exits with its exit code:

```
*/5 * * * * /path/to/bosun-x-dashboard/scripts/lib/job-run.sh user-sync --label "User sync" --family courier --every 5m -- /path/to/sync.sh >> sync.log 2>&1
```

`--family` picks the trade that walks it in the port (lamplighter, courier, warehouse, watchman, sweeper, clerk); `--every` gives the Backups page a cadence to call it overdue against. Wrapped lines count as monitored, so they drop off the "not monitored" list. Publicly, a job is its trade and a generic line ("the courier ran the post between the offices"); its name and label stay private.

## Handoffs and containers in the port (BXD-104, BXD-105)

**Handoffs.** Every `bosun start`, `checkpoint` and `finish` is already in the project's `HANDOFF.yml` trail, so the port reads it with no extra emitter: a ship's-log line ("Claude signed Planner's log", "opened … for a new watch", "closed … for the watch"), and it counts as a sign of life for the ship. The private log carries the checkpoint's one-line work summary; the public one only says which kind of agent signed.

**Containers.** `scripts/container-events.sh` (cron every couple of minutes, wrapped by `job-run.sh`) compares container state between runs, because Docker's own event history is too short to poll: a new start time is a start (a deploy, restart or recreate) and a higher restart count is a crash that the restart policy picked up. Lines go to `<receipts>/_events/containers.jsonl` (name, time, action, exit code only; bounded). The port maps container names to projects through each `project.yml`'s `containers`; containers no project claims are left out. A start is a dockhand carrying fresh timber up that ship's gangplank ("took on fresh timber: 3 services redeployed", merged per ship and minute); a crash rings the office bell and logs a leak.

## Restore drills in the port (BXD-96)

`scripts/fleet-restore-test.sh` already appends one line per store it tests to `<receipts>/<project>/<store>.restore-log.jsonl` (`store`, `tested_at`, `ok`, plus details), so the port reads that with no new emitter. Each drill is a diver: a hard-hat diver walks from the warehouse to the ship, goes under beside its hull, works along it and climbs back out (one per ship per minute). The ship's log reads "divers checked {ship}'s hull: N backups restored clean"; a failed restore is "divers found a hole in {ship}'s hull" and also rings the office bell. Store names stay on the private log only.

## The press (BXD-96)

The content planner (planner-agent) writes one line to `<receipts>/_events/press.jsonl` for every topic card, social draft and long-form article its Postiz client creates (cron jobs and MCP agents alike), and `planner press scan` (cron, every 15 minutes) adds each post Postiz has published: social posts as `published`, site articles as `site`. Lines carry kind, time, provider and project only; no titles, captions or links. The planner maps Postiz channels to projects; a channel with no ship (a personal account) is printed "in town".

In the port the print shop, THE PRESS, sits down the lane below the town. The printer (paper hat, inky apron) carries a fresh sheet up the lane to the ship for each card, draft or long read; the newsboy (flat cap, satchel) runs papers along the quay for each post that went out, or to the ship for a site article. One walk per ship, kind and minute. The ship's log: "the press set a topic card for {ship}", "the press ran off 3 drafts for {ship}", "the press set a long read for {ship}", "the newsboy cried a new post for {ship}", "a new article went up on {ship}'s notice board".
