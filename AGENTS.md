<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# bosun-x dashboard

A self-hosted dashboard: tracked projects (specs/status/ideas), live infra state for the
local host + discovery across a few more, a standards registry, and freeform notes. Full
design context is in `data.example/projects/dashboard/SPEC.md` and `STATUS.md` — read those
before making structural changes. The public app repo is `x-hakt/bosun-x-dashboard`; the
operator's own data + deployment live in a separate private repo (this deploy uses a
sibling `bosun-x-data`).

## Data model

- Real data lives in `data/` (gitignored) in production it's the bind-mounted host folder
  set via `DATA_DIR`. `data.example/` is the git-tracked reference/seed copy — never put
  real secrets or personal data there. Run `npm run init-data` once for local dev to seed
  `data/` from it.
- One directory per project under `data/projects/<slug>/`: `project.yml` (metadata; see
  `src/lib/data/schema.ts`) plus optional `SPEC.md`/`STATUS.md`/`IDEAS.md`/`HANDOFF.md`. A
  project "graduates" from `idea`/`designing` to `active` by editing `stage` (and
  `host`/`path`/`repo`) in place — never by moving files.
- Task `description` fields and planning `NOTES.md` render as a **conversation thread** in
  the UI (`src/lib/data/notes-thread.ts` parses it; nothing is stored differently — still
  one plain-markdown field, still greppable). When you add to one, start your turn with a
  header line so it renders as its own card: `--- <You> · <YYYY-MM-DD> · <optional label> ---`
  (e.g. `--- Claude · 2026-09-01 · shipped ---`). The older `--- LABEL (date, Author) ---`
  and leading `DONE 2026-08-30 (Claude), …` shapes are still parsed. Keep the opening
  turn (everything before the first header) as the task's standing brief.

## HANDOFF.md — continuity across sessions/agents

The handoff CLI and the MCP server are the [`bosun-x`](https://github.com/x-hakt/bosun-x)
package (extracted in CR-5). `scripts/handoff.mjs` and `mcp/server.mjs` are thin wrappers
that resolve the data dir (`$BOSUN_DATA`, else a `.bosun-data-path` file, else a sibling
`bosun-x-data`/`control-room-data`, else `./data` — see `scripts/lib/data-dir.mjs`) and
hand off to the package; `npm run handoff` / `npm run mcp` are unchanged.
The Next app keeps its own board renderer in `src/lib/data/status-board.ts` — it must stay
byte-for-byte in step with `bosun-x`'s `lib/board.mjs`.

Every project directory can have a `HANDOFF.md`: an append-only running log, **newest entry on
top**, plain markdown, no special format beyond "timestamp, agent, what was just done, current
state, explicit next steps." Rendered read-only on the project detail page (a "Handoff log"
panel) — it's meant to be appended to directly with normal file tools (by Claude, Codex, or a
human), not through the UI.

**Checkpoint continuously, not only at the end.** At the beginning of substantive work run
`npm run handoff -- start <slug> --agent <name> --summary <work>`. After each verified milestone
(and at least every 30 minutes while actively changing a project), run `checkpoint`; before a
planned stop run `finish`. Also checkpoint before long builds, migrations, deployments, or other
operations where the session could be interrupted. A session getting cut off mid-task is exactly
the failure mode this exists to prevent. The CLI serializes writers with a per-project lock and
atomically replaces both files; do not bypass it for routine entries.

**Name the task you're working.** Pass `--task <KEY>` (e.g. `--task CR-13`, or a bare number,
or a comma list) to `start`/`checkpoint`/`finish`. `start`/`checkpoint` move those `tasks.yml`
entries to `in_progress`; `finish` moves them to `done`. This is the only thing that keeps the
task board honest as work happens — without it a task added mid-session sits at `backlog` while
it's being built, and the next agent burns context reconstructing the real state. It's optional
and never reopens a task already `done`; a checkpoint that omits `--task` keeps whatever the
previous one named.

**STATUS.md keeps itself current.** Every checkpoint regenerates the `<!-- bosun:task-board -->`
block in `projects/<slug>/STATUS.md` from `tasks.yml` (the app does the same on any task edit),
so the file's task board is never hand-maintained — edit tasks, not that block; the prose around
it is yours. `npm run handoff -- doctor` reports drift (a task stuck `in_progress` with no active
handoff, a live handoff whose task never moved, a stale board); `npm run handoff -- doctor --fix`
reconciles what it safely can and regenerates every board.

`HANDOFF.yml` is the bounded machine-readable resume snapshot used for active/stale indicators;
`HANDOFF.md` remains the human-readable append-only history. On takeover run
`npm run handoff -- resume <slug>` and read only that concise output; never load the entire
Markdown history by default. The snapshot carries `latest` (the current checkpoint in full) plus
`trail` — the last few checkpoints as one-liners, so a thin or hasty checkpoint can't erase the
trajectory that led to it; `resume` prints both. A checkpoint must distinguish
verified work from attempts, include actual test results, name unresolved blockers, and give one
concrete next action. The incoming agent reads the resume output plus `git status` and recent
commits before changing anything. The CLI rejects overlapping active owners and checkpoint/finish calls
from the wrong agent. Never assume another agent can read the outgoing agent's transcript.

Whoever (or whatever) picks the work up next should be able to read the latest entry and resume
without re-deriving decisions already made. `data.example/projects/recipes-api/HANDOFF.md` is
the reference example — copy its shape for any other project that wants this.
- `data/standards.yml` defines checks scored against every project via a **fixed** switch in
  `src/lib/checks/registry.ts` — never add a check type that executes arbitrary shell/YAML
  content; add a new named function + one registry line instead.

## Auth

No provider env configured → the app is fully open, no login wall
(`src/lib/auth-config.ts` / `configuredProviders()` is the single source of truth for this
toggle). Don't "fix" this by adding a fallback dev user or bypass flag — the toggle is
intentional until real credentials are configured.

Providers are read from env in `auth.ts`: Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`),
GitHub (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`), generic OIDC (`OIDC_ISSUER`/`OIDC_CLIENT_ID`/
`OIDC_CLIENT_SECRET` + optional `OIDC_NAME`). Any combination works; the login page shows one
button per configured provider. Access is then gated by an email allowlist — `ALLOWED_EMAIL`
env (single address, wins) or `operators:` in `config.yml`. Full setup: `docs/auth.md`.

## Conventions

- Next.js 16: the root proxy file is `proxy.ts` (not `middleware.ts`), dynamic route `params`
  are async, see the managed block above for where the version-matched docs live.
- Any route/server action touching `DATA_DIR`, git, or the Docker socket must run on the
  Node.js runtime (`export const runtime = "nodejs"`) and treat data as changing outside
  Next's knowledge — use `export const dynamic = "force-dynamic"`, don't rely on caching.
- This repo is the public app. It ships `deploy/docker-compose.example.yml` and a
  fictional `data.example/`; a real deployment (operator domains, allow-listed email,
  host paths, Traefik labels) is kept out of it. Never commit operator-specific data
  or deployment config here.

## Fleet scripts — the destructive-op rules (non-negotiable)

`scripts/fleet-*.sh` run on the host and touch Docker, databases, and the backup
destination. On 2026-09-02 a restore-test run (executed mid-edit by the
`--requests` cron) removed live `playtopia-db`/`tournament-db` containers. Rules:

- **Start containers only via `throwaway_run_d` / `throwaway_run_stream`** from
  `scripts/lib/docker-safe.sh` — they force `--rm --network none`, no `--name`,
  and a per-run label.
- **Remove containers only via `throwaway_rm` / `throwaway_rm_all`** — label-only,
  re-checked with `docker inspect`. Never `docker rm <name>`, never
  `--filter name=`/`ancestor=`. No `docker stop|kill|prune`, `volume rm`, or
  `compose down` anywhere in these scripts.
- **Delete files only via `prune_glob`** or after `guard_path`. No bare
  `ls | rm`, no `rm -rf "$var"` without a guard.
- The dashboard's dockerode client is **list/inspect only** — never add
  `.stop()`/`.remove()`/`.kill()`/`.createContainer()`/`.exec()`.
- After changing any `fleet-*.sh` or `scripts/lib/`, run
  `scripts/test/safety-check.sh` — it must print `ALL SAFETY CHECKS PASSED`.
- Never edit a `fleet-*.sh` in place while its cron is live; the `--requests`
  runner now refuses a script changed in the last 2 min or failing `bash -n`,
  but disable the cron line or edit-and-swap anyway.
