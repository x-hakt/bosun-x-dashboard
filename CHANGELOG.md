# Changelog

All notable changes to the bosun-x dashboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the `vX.Y.Z` tags
that trigger a GHCR image build.

## Unreleased

### Added

- Notifications (BXD-99): a "Needs you" list at the top of the Overview, with a count badge
  on Overview in the sidebar. Anything can raise one with `npm run notify -- raise --key …
  --title …` (a planner run asking you to pick topics, a cron job, an agent); raising the
  same key updates it. Each row has Tomorrow / Next week / Done; Done keeps it away until
  the source says something new. Stored in `notifications.yml` in the data folder. See
  docs/notifications.md.
- Remote `files` backup stores: a `files` store can now name an `ssh_alias` whose
  forced-command key emits a tar (like remote Postgres stores already did), so media on
  another host is backed up without giving Caspar a shell there.

### Changed

- Pirates (BXD-97): the crew are pirates with a look generated from their name and a sash
  in their model's colour; every ship has its own colours and Jolly Roger; commits go up the
  gangplank and down the hatch, working crew haul cargo, ready crew have an ale outside the
  Salty Dog tavern, and finished crew walk into it.

- The port, round two (BXD-89..93): every project is a ship (quiet ones at moorings in the
  bay), sailors and dockhands have generated names shown when they're busy, boarding glides
  the port's camera onto the ship with a crew card (the old single deck is gone), stale
  sailors doze sitting up, and a squad-style rolling ship's log sits under the port on both
  pages; the per-session lanes are now the watch bill. `allProjects: true` in
  activity-public.json names every project publicly.

### Added

- The port (BXD-85..88), replacing the harbour grid (BXD-82) on /activity and
  /crew/embed alike: ships at berths, sailors (live sessions) walking between town, quay
  and deck as their state changes, dockhands and the harbour master running errands for
  real commits, finished tasks, backups, tide readings and approval bells, and scenery
  (townsfolk, gulls, lighthouse, day and night by Sydney time). Reduced motion: static.
- Public ship's log and port from one whitelisted feed (BXD-87): aliases, anonymous
  private voyages, opaque ids, minute-rounded times; a leak test guards the JSON.
  `/api/crew/public` now returns this feed (the old crew/fleet shape is gone).
- Ship's log (BXD-84): the last 24 hours as per-session timeline lanes by project, state
  bars, stale hatching, job markers and a now edge, on the private activity page. The roster
  and the log share one state machine (`src/lib/activity-state.ts`), tested to agree.

## v0.2.1 — 2026-09-25

Per-project usage history, a clear story for macOS, and a clean systemd stop.

### Added

- Usage history on each server's page (BXD-71): a RAM sparkline per project for the
  last 24 h or 14 d, p95 and peak marked, CPU p95 alongside, from the capacity
  sampler's history. Server-rendered SVG; sampler outages show as gaps, not zeros.

### Changed

- macOS is supported with one documented gap (BXD-72): the local machine's memory, disk
  and load come from Linux tools, so on any other OS its host card and server page now
  say so instead of showing bare dashes (and a bogus 0 cores). Containers and remote
  Linux servers are unaffected. npm README, getting started, capacity and
  troubleshooting docs spell out what works where, plus the Docker Desktop socket.

### Fixed

- npm launcher: `systemctl --user stop` (and anything else that sends SIGTERM) left the
  service `failed`, because Next exits 143 on SIGTERM and the launcher passed that code
  through. A stop the launcher was asked for now exits 0 (BXD-70).

## v0.2.0 — 2026-09-25

The dashboard is now installable from npm, and gains a capacity view for your servers.

### Added

- **On npm** (BXD-68): `npx bosun-x-dashboard --demo` runs it on sample data with
  nothing to set up; `bosun-x-dashboard --data <dir>` (or `bosun dashboard` from the
  bosun-x CLI) runs it over your own data folder. Listens on localhost by default and
  warns before binding a network address with no sign-in. Built from a clean clone by
  `npm run build:npm` (see docs/deploying.md). New [getting started](docs/getting-started.md)
  guide: install, first data folder, agents, remote servers, sign-in, systemd.
- **Mobile support** (BXD-54) — a full responsive retrofit. The sidebar collapses
  behind a hamburger into an off-canvas drawer below the `md` breakpoint instead of
  permanently eating ~224px of a phone-width screen; the top bar and main content
  padding shrink to match. A page-by-page audit fixed the remaining narrow-viewport
  breakage: a fixed-width rename input, a task row that squeezed its title under a
  client-portal share toggle, a stat grid, and a header action row that clipped
  instead of wrapping. Desktop is unchanged. The point: adding a new idea from
  Planning no longer has to wait until you're back at a desk.
- Planning page now nests sub-ideas under their parent instead of listing every
  idea as a flat row grouped only by its own status.
- **Planning in the sidebar** (BXD-56) — mirrors Projects: coloured status
  sub-headings (idea / planning / ready / graduated) with the top-level ideas listed
  under each. The Planning page's status headings use the same colours.
- **Independent sidebar sections** (BXD-59) — every section with sub-items has a
  chevron and stays open until you close it, so Projects and Planning (or Servers)
  can be open together. Remembered per browser.
- **Rename an idea** (BXD-57) — inline title editing on the idea page.
- **Collapse sub-ideas** (BXD-60) — a chevron at the front of any Planning row with
  sub-ideas hides or shows them. Remembered per browser.

- **Capacity on Servers** (BXD-61) — per server, RAM (primary), CPU and disk bars of the
  whole machine, split into the projects using it, unregistered and shared containers,
  the host itself, and free space, with a dashed 80% comfort line and a per-project
  legend. Live snapshot for now (history + p95 next: BXD-62/63).
- **Capacity sampler** (BXD-62) — `scripts/capacity-sample.sh`, a 5-minute host cron
  job that records every server host's memory/CPU/disk totals and per-container
  memory/CPU to `$BACKUP_RECEIPTS/_capacity/<date>.jsonl` (14 days kept). Read-only on
  every host; shows as "Capacity sampler" among the scheduled jobs.
- **Typical and peak usage** (BXD-63) — once a day of sampler history exists, the
  capacity bars show each project's p95 over the last 14 days (per-sample project
  totals, containers mapped with current discovery) with now and peak on hover, a
  ↑peak marker where a spike is well above p95, and the 80% line applied to p95.
- **Move simulator** (BXD-64) — on Servers, pick a running project and a target server
  to see both servers' RAM/CPU after the move (the project hatched on the target), a
  fits / tight (over 80%) / doesn't fit verdict, and warnings for databases, named
  volumes, bind mounts, Traefik routing, CPU architecture and snapshot-only figures.
  Computed in the browser; changes nothing.
- **Disk per project** (BXD-65) — a daily read-only measurement on the dashboard's own
  host (`capacity-sample.sh --disk`) splits the disk bar by project: images' unique
  layers, writable layers, named volumes and writable data folders, plus unused
  images/volumes as reclaimable. The move simulator adds disk to its verdict.
  Docker is queried field-by-field so container commands, labels and environment
  (which can hold secrets) are never read.
- **Disk per project on remote servers** (BXD-66) — the remote hosts' forced read-only
  command answers exactly `bosun-x-disk` with the same measurement (`setup-remote.sh`
  includes it for new hosts; existing hosts need the block added to their script, see
  docs/capacity.md), so every server's disk bar is split by project.

### Changed

- **Sub-ideas follow their parent's status** (BXD-58) — changing an idea's status
  (including graduating it) applies the same status to every sub-idea beneath it.
  A sub-idea can still be moved on its own afterwards.

### Fixed

- Editing an idea from the UI no longer strips the `#` comment lines agents leave
  in its `task.yml`.

## v0.1.0 — 2026-09-10

First public release, extracted from a private working repo (`x-hakt/control-room`)
and renamed. Published to `ghcr.io/x-hakt/bosun-x-dashboard` (`:v0.1.0`, `:0.1`,
`:latest`). Consumes the [`bosun-x`](https://github.com/x-hakt/bosun-x) CLI/MCP
package and shares its on-disk data model.

### Added

- **Client portal** — an optional second deployment (`BOSUN_MODE=portal`) that gives
  each client a themed, per-client window onto only the work you've shared with them.
  - Two default-closed gates (`project.portals[]`, `project.shared_with[]`) and one
    projection function that a lint rule forces every client-facing page through, so
    host / path / repo / handoff logs / backups / other projects have no way out.
  - Per-client theming (fonts, favicon, header/footer, login) from `clients.yml`.
  - Granular sharing: a shared project shows status and tech tags, but every task
    stays invisible — title and all — until flagged for that client;
    `task_sharing_default` per project; per-link `portal: true` opt-in; a `PORTAL.md`
    in the project folder replaces the generated summary in the operator's words.
  - Two-way: clients reply into any shared task or planning thread and post a
    one-click approve / sign-off; replies come back flagged (amber thread card, board
    badge, overview tile). One always-on direct-message thread per client, unread
    badges both ways. A "since your last visit" digest on the portal home.
  - Operator side: **Settings → Client portals** to register portals and people, and
    preview the exact projection a given client receives, including a list of what is
    sitting in their portal that you have *not* shared yet.
- **Assisted restore** — `scripts/fleet-restore.sh` restores what `fleet-backup.sh`
  writes, dispatching on a mode: `pg-container`, `pg-remote` (ssh alias),
  `files-path`, `files-volume`. Every mode takes a pre-restore snapshot first
  (mandatory undo) and, for files stores, restarts the containers in the store's
  `restore_restart:` list. `redis` is refused with a runbook (it rewrites its AOF on
  shutdown). Driven from the `/backups` page: per-project run / test-restore
  controls, live status after queueing, restore-test results and history, and a
  reversible in-place restore into the live database.
- **Point-in-time restore** — the dashboard reads an archive index so you can pick an
  older backup, not just the latest.
- **Restore-drill reminders** — a check that flags projects whose last restore test is
  overdue, with the cadence configurable.
- **Loud failure alerting** — a scheduled backup or job that never ran, or ran and
  failed, surfaces as an alert rather than staying silent.
- **Nightly git push** for `method: git` projects, so a repo-only project's state is
  off the box every day without an agent session.
- `scripts/setup-remote.sh` — mint a least-privilege discovery SSH credential for a host.
- **GHCR release workflow** — `git tag vX.Y.Z && git push --tags` publishes
  `ghcr.io/x-hakt/bosun-x-dashboard` (`:vX.Y.Z`, `:X.Y`, `:latest`).
- **CI workflow** — tsc + lint + build on every push and PR.
- **Podman** — honours `DOCKER_HOST` for the local socket; reads `io.podman.compose.*`
  labels as a discovery-grouping fallback.
- `docs/` — configuration, projects, discovery, deploying, security, troubleshooting,
  restore, portal.

### Changed

- **CR-47 rename** — "Control Room" is now **bosun-x** throughout: package name, wrapper
  and fleet scripts, on-disk data-dir labels, and the discovery forced-command
  (`control-room-ro` → `bosun-x-ro`).
- **Notes** are entry-based (`<DATA_DIR>/notes.yml`, task-shaped, no status) with a
  top-level `/notes` page, replacing the single freeform "Inbox" textarea and the
  `planning` `type: note` items. Removed the hardcoded "Cool websites" pane.
- **Nested sub-tasks** — a task id can be dotted (`CGB-2.1` under `CGB-2`); `--task` and
  the board understand dotted refs, and an orphaned-parent check flags a subtask whose
  parent is gone.
- `/projects` list is unfiltered and the sharing controls are visible on it.

### Fixed

- Doubled lines in `fleet-backup.log`.
- `safety-check.sh` now actually runs (and runs automatically).

### Security

- An unshared task's **title and status** could leak to a portal client through the
  board projection. Fixed: a task withheld by the gates returns nothing at all.
