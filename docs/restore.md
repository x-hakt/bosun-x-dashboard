# Restoring from a backup

This is the generic runbook for anything `scripts/fleet-backup.sh` produced. A
deployment keeps its own project-specific version (which container, which
database name, where the app expects its files) — see
`control-room-data/docs/DISASTER-RECOVERY.md` for the operator's fleet.

## What the agent wrote

For every store in a project's `backups.yml`, on the destination:

```
<destination>/<slug>/<store>-<UTC-timestamp>.<ext>
```

| Store kind | `<ext>` | Produced by |
|---|---|---|
| `postgres` | `dump.zst` | `pg_dump -Fc \| zstd -19` |
| `files`, `redis` | `tar.zst` | `tar -cf - \| zstd -19` |
| any, when `encrypt.age_recipient` is set | the above `+ .age` | `\| age -r <recipient>` |

Alongside each archive, the receipt at
`<BACKUP_RECEIPTS>/<slug>/<store>.latest.json` records the `sha256`, byte size,
and finish time of the newest run. `<store>.restore.json` records the last
restore test (see `fleet-restore-test.sh`).

The newest archive is the one whose timestamp sorts last:

```sh
ls -1 <destination>/<slug>/<store>-*.* | sort | tail -1
```

## 1. Pull the archive back

```sh
ARCHIVE=<destination>/<slug>/<store>-<timestamp>.<ext>
cp "$ARCHIVE" /tmp/restore/          # or scp from the destination host
cd /tmp/restore
```

Verify it against the receipt before you trust it:

```sh
sha256sum "$(basename "$ARCHIVE")"
jq -r .sha256 <BACKUP_RECEIPTS>/<slug>/<store>.latest.json
```

## 2. Decrypt (only if the name ends `.age`)

The private key is the **restore key** — an `age` identity kept out of the
backup itself (for the operator: `control-room-data/backup-keys/<slug>.age`,
gitignored, and a copy in a password manager).

```sh
age -d -i <slug>.age -o "<store>.zst" "<store>-<timestamp>.dump.zst.age"
```

Without `.age`, the archive already ends `.zst` — skip this step.

## 3. Decompress

```sh
zstd -d "<store>.zst" -o "<store>.dump"      # postgres  -> a custom-format dump
zstd -d "<store>.tar.zst" -o "<store>.tar"   # files/redis -> a tar
```

## 4. Restore

### Postgres

Restore into a **fresh, empty** database. `--no-owner --no-privileges` drops the
role assignments from the source cluster (roles rarely match on a new box; grant
what the app needs afterwards).

```sh
# into a container:
docker cp <store>.dump <pg-container>:/tmp/
docker exec <pg-container> pg_restore -U <user> -d <database> \
  --no-owner --no-privileges --clean --if-exists /tmp/<store>.dump

# or against a reachable server:
pg_restore -h <host> -U <user> -d <database> \
  --no-owner --no-privileges --clean --if-exists <store>.dump
```

Sanity check:

```sh
psql -U <user> -d <database> -c "\dt"
psql -U <user> -d <database> -c "select count(*) from <a-known-table>;"
```

### Files / redis volume

The tar holds one top-level directory (the basename of the store's `path`, or
`.` for a Docker volume). Extract it where the app reads it.

```sh
# a bind-mount path:
tar -xf <store>.tar -C "$(dirname <original-path>)"

# a Docker volume:
docker run --rm -v <volume>:/dst -v /tmp/restore:/src alpine \
  sh -c 'cd /dst && tar -xf /src/<store>.tar'
```

For redis, restore while the container is stopped, then start it so it loads the
dump/AOF on boot.

## 5. Point the app at it and smoke-test

Bring the app up, hit its health endpoint, log in, load one record that lives in
the restored data. Note the result (and the archive timestamp you restored from)
in `control-room-data/docs/restore-drills.md`.

## The secrets bundle

If `infra/secrets-backup.yml` is set, `scripts/fleet-secrets-backup.sh` also
writes `<destination>/_secrets/secrets-<date>.tar.zst.age` — the env files, SSH
keys and VPN certs that are deliberately not in any git repo. It is always
age-encrypted with the `_secrets` restore key.

```sh
age -d -i backup-keys/_secrets.age -o secrets.tar.zst secrets-<date>.tar.zst.age
zstd -d secrets.tar.zst -o secrets.tar
sudo tar -xpf secrets.tar -C /        # paths are absolute; restores in place
```

This is the one archive whose restore key can't be recovered from another
backup — it must come from your password manager.

## Restoring from the dashboard

The project's Backups pane has a red **"restore into the live database"** section
(postgres container stores only). It runs `scripts/fleet-restore.sh` via the
same request queue as the other buttons. That script:

1. refuses to run without `FLEET_RESTORE_CONFIRM=<slug>` (the queue sets it from
   the type-to-confirm request);
2. takes a **pre-restore dump** of the current database first —
   `<dest>/<slug>/<store>-pre-restore-<ts>.dump.zst` — and aborts if it can't.
   That dump is the undo: pick "undo last restore" in the pane, or
   `fleet-restore.sh <slug> <store> <that-filename>`;
3. checks the archive's sha256 against its receipt;
4. resets the `public` schema and `pg_restore`s, so the database ends up as
   *exactly* the archive (a table added after that backup won't linger).

`ssh_alias` (remote) stores have no restore path yet — do those by hand with the
steps above.

## Testing without a disaster

`scripts/fleet-restore-test.sh` does steps 1–4 weekly into a throwaway
`postgres:*` container and writes `<store>.restore.json`, which the dashboard
shows as "restore verified Nd ago". Run one on demand from the project's Backup
pane ("test restore") or:

```sh
scripts/fleet-restore-test.sh <slug>
```
