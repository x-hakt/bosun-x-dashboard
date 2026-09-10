# Changelog

All notable changes to the bosun-x dashboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the `vX.Y.Z` tags
that trigger a GHCR image build.

## Unreleased

_Nothing yet._

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
