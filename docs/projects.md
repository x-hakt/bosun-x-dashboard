# Projects

One directory per project: `<DATA_DIR>/projects/<slug>/`. The slug is the folder name.
A project "graduates" from an idea by editing files in place — never by moving folders.

```
projects/recipes-api/
  project.yml     metadata (required)
  SPEC.md         the canonical spec           (optional)
  STATUS.md       prose + a generated task board (optional)
  tasks.yml       the task list                (optional)
  backups.yml     what to back up and where    (optional)
  HANDOFF.md      append-only handoff log      (written by the bosun-x CLI)
  HANDOFF.yml     bounded resume snapshot      (written by the bosun-x CLI)
```

## project.yml

```yaml
name: recipes-api            # required
slug: recipes-api            # required, matches the folder
key: RCP                     # optional task-id prefix; defaults to slug initials
stage: active                # active | paused | archived
status: Live                 # free-text real-world status (Live, Paused, Development, …)
host: cloud-vps              # id from infra/hosts.yml
path: /opt/recipes-api       # where the repo/files are on that host
repo:
  url: git@github.com:you/recipes-api.git
  default_branch: main
containers:                  # or the singular `container:` for one
  - compose_service: recipes-api
tags: [nodejs, postgres]
links:
  - label: Live
    url: https://recipes.example.com
vendored: false              # true = off-the-shelf; skip all standards checks
needs_review: false          # true = something's ambiguous, flag it in the UI
also_on:                     # known extra deployments (staged migration, blue/green)
  - host: staging-box
    path: /opt/recipes-api
    note: pre-release copy
notes: >
  Free text. Rendered on the detail page.
```

## tasks.yml

```yaml
seq: 3                       # highest task number issued so far
tasks:
  - id: <uuid or any stable string>
    num: 2
    title: Add full-text search
    description: >-
      Free markdown. Renders as a conversation thread — start an addition with
      a header line:  --- You · 2026-01-14 · shipped ---
    status: in_progress      # backlog | todo | in_progress | done
    depends_on: []
    created: '2026-01-12T09:00:00.000+00:00'
    updated: '2026-01-14T15:30:00.000+00:00'
```

Task ids render as `<KEY>-<num>` (e.g. `RCP-2`). The `bosun-x` CLI's `--task` flag and
the dashboard's task actions both move `status` and keep it in sync with the handoff.

## STATUS.md

Your prose, plus one generated block:

```
<!-- bosun:task-board:start -->
## Task board
...regenerated from tasks.yml on every checkpoint and every UI task edit...
<!-- bosun:task-board:end -->
```

Edit `tasks.yml`, not the block. Everything outside the markers is yours.

## backups.yml

```yaml
backup_required: true
method: agent               # agent | git | none
destination: nas            # id from infra/destinations.yml (agent method)
stores:
  - name: recipes-db
    kind: postgres          # postgres | files | redis
    container: recipes-api-postgres
    database: recipes
    schedule: nightly
    retention: { keep_last: 14 }
```

The dashboard only reads this and renders backup health. The dump/transfer is the
separate backup agent's job (`scripts/fleet-backup.sh` is the reference implementation).

## Planning

Pre-project ideas live under `<DATA_DIR>/planning/<ID>/` with a `task.yml`
(`status: idea | planning | ready | graduated`) and a free `NOTES.md`.
