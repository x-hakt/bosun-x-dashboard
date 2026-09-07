#!/usr/bin/env bash
# ============================================================================
# fleet-restore.sh  —  IDEA-10 / CR-38  —  a REAL restore into the live database
#
#   fleet-restore.sh <slug> <store> [<archive-basename>|latest]
#
# This overwrites a live Postgres database with the contents of a backup. It is
# the single most destructive action in the fleet, so:
#
#   1. it refuses to run without FLEET_RESTORE_CONFIRM=<slug> in the environment
#   2. step one is ALWAYS a fresh pre-restore dump of the current database to
#      <dest>/<slug>/<store>-pre-restore-<ts>.dump.zst — if that fails, it aborts.
#      That dump IS the undo: `fleet-restore.sh <slug> <store> <that-file>`.
#   3. the target container must be exactly the one named in backups.yml
#   4. the archive's sha256 is checked against its receipt when restoring "latest"
#
# v1 restores container-based Postgres stores only. ssh_alias (remote) stores
# need a dedicated restore forced-command — see docs/restore.md, do it by hand.
# ============================================================================
set -uo pipefail

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/data-dir.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/data-dir.sh"
RECEIPTS_DIR=${BACKUP_RECEIPTS:-$HOME/backup-receipts}
KEYS_DIR="$BOSUN_DATA/backup-keys"
SSH_CONFIG=${BACKUP_SSH_CONFIG:-$HOME/.ssh/config}  # BXD-39: ssh_alias restores
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}

mkdir -p "$(dirname "$LOG")"
export BACKUP_RECEIPTS="$RECEIPTS_DIR"
# shellcheck source=lib/docker-safe.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/job-marker.sh"
# shellcheck source=lib/archive-index.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/archive-index.sh"

now() { date -u +%FT%TZ; }
ts()  { date -u +%Y%m%dT%H%M%SZ; }
# BXD-43: stderr only — the cron redirect (`>> fleet-backup.log 2>&1`) already
# captures it into $LOG; a tee to the same file doubled every line.
say() { echo "[$(now)] restore: $*" >&2; }

SLUG=${1:-}; STORE=${2:-}; WHICH=${3:-latest}
[ -n "$SLUG" ] && [ -n "$STORE" ] || { echo "usage: fleet-restore.sh <slug> <store> [<archive>|latest]" >&2; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || { echo "bad slug" >&2; exit 2; }

WORK=$(mktemp -d /tmp/fleet-restore.XXXXXX) || { echo "mktemp failed" >&2; exit 1; }
trap 'guard_path "$WORK" /tmp; rm -rf -- "$WORK"; _job_finish' EXIT

receipt() { # <ok> <from_archive> <pre_dump> <tables_after> [error]
  local dir="$RECEIPTS_DIR/$SLUG"; mkdir -p "$dir"
  jq -nc --arg store "$STORE" --arg at "$(now)" --argjson ok "$1" \
     --arg from "$2" --arg pre "$3" --argjson tables "${4:-0}" --arg error "${5:-}" \
     '{store:$store, restored_at:$at, ok:$ok, from_archive:$from, pre_restore_dump:$pre, tables_after:$tables}
      + (if $error=="" then {} else {error:$error} end)' \
    | tee "$dir/$STORE.restore-live.json" >>"$dir/$STORE.restore-live-log.jsonl"
}
abort() { say "ABORT: $*"; receipt false "${ARCHIVE:-}" "${PRE_DUMP:-}" 0 "$*"; exit 1; }

# --- resolve the store from backups.yml + destinations.yml -------------------
eval "$(python3 - "$BOSUN_DATA" "$SLUG" "$STORE" <<'PY'
import sys, yaml, shlex, os
dd, slug, store = sys.argv[1], sys.argv[2], sys.argv[3]
b = yaml.safe_load(open(f"{dd}/projects/{slug}/backups.yml")) or {}
dests = {d["id"]: d for d in (yaml.safe_load(open(f"{dd}/infra/destinations.yml")) or {}).get("destinations", [])}
d = dests.get(b.get("destination"), {})
s = next((x for x in (b.get("stores") or []) if x.get("name") == store), None)
q = shlex.quote
if not s:
    print("S_FOUND=0")
else:
    print("S_FOUND=1")
    print(f"S_KIND={q(str(s.get('kind','')))}")
    print(f"S_CONTAINER={q(str(s.get('container','')))}")
    print(f"S_SSH={q(str(s.get('ssh_alias','')))}")
    print(f"S_DB={q(str(s.get('database','')))}")
    print(f"S_PATH={q(str(s.get('path','')))}")
    print(f"S_VOLUME={q(str(s.get('volume','')))}")
    print(f"S_RESTART={q(' '.join(s.get('restore_restart') or []))}")
    print(f"S_AGE={q(str((s.get('encrypt') or {}).get('age_recipient','')))}")
    print(f"D_PATH={q(str(d.get('path','')))}")
    print(f"D_MOUNT={q(str(d.get('mount','')))}")
    print(f"D_SENTINEL={q(str(d.get('sentinel','')))}")
PY
)"

[ "${S_FOUND:-0}" = 1 ] || abort "no store '$STORE' in projects/$SLUG/backups.yml"
[ -n "${D_PATH:-}" ] || abort "destination path not resolved"

# Work out how this store is restored:
#   pg-container  postgres + container      -> docker exec
#   pg-remote     postgres + ssh_alias      -> the host's backup-restore forced
#                                              command (BXD-39); restore alias
#                                              mirrors the backup alias
#                                              (backup-gpforms -> restore-gpforms)
#   files-path    files/redis + path        -> rsync --delete into the bind mount
#   files-volume  files/redis + volume      -> throwaway container clears + untars
#                                              the volume; then restart the
#                                              consumers in `restore_restart:`
MODE=
case "${S_KIND:-}" in
  postgres)
    if   [ -n "${S_CONTAINER:-}" ]; then MODE=pg-container
    elif [ -n "${S_SSH:-}" ]; then
      MODE=pg-remote
      case "$S_SSH" in
        backup-*) RESTORE_ALIAS="restore-${S_SSH#backup-}" ;;
        *) abort "ssh_alias '$S_SSH' is not a backup-<host> alias — can't derive the restore alias" ;;
      esac
    else abort "postgres store has neither a container nor an ssh_alias"
    fi
    ;;
  files|redis)
    if   [ -n "${S_PATH:-}" ]; then MODE=files-path
    elif [ -n "${S_VOLUME:-}" ]; then MODE=files-volume
    else abort "'$S_KIND' store has neither a path nor a volume"
    fi
    # redis specifically can't be restored live — it rewrites its persistence on
    # shutdown and would clobber the restored files. Left as a manual runbook.
    [ "${S_KIND:-}" = redis ] && abort "redis stores are restored manually — stop the container, replace the AOF/RDB, start it (see the Backups pane / docs)"
    ;;
  *) abort "restores postgres and files stores (this is '${S_KIND:-?}')" ;;
esac

# --- confirmation -----------------------------------------------------------
[ "${FLEET_RESTORE_CONFIRM:-}" = "$SLUG" ] || abort "refusing — set FLEET_RESTORE_CONFIRM=$SLUG to proceed"

OUT="$D_PATH/$SLUG"
guard_path "$OUT" "$D_PATH"
export BOSUN_PRUNE_ROOT="$D_PATH"
[ -n "$D_MOUNT" ] && ! mountpoint -q "$D_MOUNT" && abort "$D_MOUNT not mounted"
[ -z "$D_SENTINEL" ] || [ -f "$D_PATH/$D_SENTINEL" ] || abort "destination sentinel missing"

# --- confirm the target -----------------------------------------------------
case "$MODE" in
  pg-remote)
    # `--check` reaches the container on the remote host and counts tables; it
    # touches nothing. Also proves the restore key + forced command are in place.
    ssh -n -F "$SSH_CONFIG" -o BatchMode=yes -o ConnectTimeout=30 "$RESTORE_ALIAS" \
        "backup-restore --check" >>"$LOG" 2>&1 \
      || abort "restore target unreachable via $RESTORE_ALIAS (is the restore forced command installed?)"
    say "$SLUG/$STORE: target = remote via $RESTORE_ALIAS (pre-dump via $S_SSH)"
    ;;
  pg-container)
    docker inspect "$S_CONTAINER" >/dev/null 2>&1 || abort "container '$S_CONTAINER' not found"
    CState=$(docker inspect -f '{{.State.Running}}' "$S_CONTAINER" 2>/dev/null)
    [ "$CState" = true ] || abort "container '$S_CONTAINER' is not running"
    say "$SLUG/$STORE: target = container '$S_CONTAINER', db '${S_DB:-\$POSTGRES_DB}'"
    ;;
  files-path)
    guard_path "$S_PATH" "$HOME/unified-services"
    [ -d "$S_PATH" ] || abort "restore target path does not exist: $S_PATH"
    say "$SLUG/$STORE: target = path $S_PATH${S_RESTART:+ (then restart:$S_RESTART)}"
    ;;
  files-volume)
    docker volume inspect "$S_VOLUME" >/dev/null 2>&1 || abort "docker volume '$S_VOLUME' not found"
    for c in $S_RESTART; do
      docker inspect "$c" >/dev/null 2>&1 || abort "restore_restart names '$c', which is not a container"
    done
    say "$SLUG/$STORE: target = volume $S_VOLUME${S_RESTART:+ (then restart:$S_RESTART)}"
    ;;
esac

job_begin fleet-restore

# --- pick the archive ------------------------------------------------------
if [ "$WHICH" = latest ]; then
  ARCHIVE=$(jq -r '.archive // empty' "$RECEIPTS_DIR/$SLUG/$STORE.latest.json" 2>/dev/null)
  RSHA=$(jq -r '.sha256 // empty' "$RECEIPTS_DIR/$SLUG/$STORE.latest.json" 2>/dev/null)
  [ -n "$ARCHIVE" ] || abort "no latest receipt for $SLUG/$STORE"
else
  case "$WHICH" in */*|*..*) abort "archive must be a bare filename" ;; esac
  ARCHIVE="$OUT/$WHICH"; RSHA=""
fi
[ -f "$ARCHIVE" ] || abort "archive not found: $ARCHIVE"
if [ -n "$RSHA" ]; then
  [ "$(sha256sum "$ARCHIVE" | cut -d' ' -f1)" = "$RSHA" ] || abort "archive sha256 does not match its receipt"
  say "$SLUG/$STORE: archive checksum verified"
fi

# --- 1. pre-restore safety snapshot (the undo) — MANDATORY ------------------
case "$MODE" in
  pg-*)        PRE_EXT=dump.zst ;;
  files-*)     PRE_EXT=tar.zst ;;
esac
PRE_DUMP="$OUT/${STORE}-pre-restore-$(ts).${PRE_EXT}"
say "$SLUG/$STORE: pre-restore snapshot -> $PRE_DUMP"
case "$MODE" in
  pg-remote)    pre_producer() { ssh -n -F "$SSH_CONFIG" -o BatchMode=yes -o ConnectTimeout=30 "$S_SSH" backup-dump; } ;;
  pg-container) pre_producer() { docker exec "$S_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "'"${S_DB:-\$POSTGRES_DB}"'"'; } ;;
  files-path)   pre_producer() { tar -C "$(dirname "$S_PATH")" -cf - "$(basename "$S_PATH")"; } ;;
  files-volume) pre_producer() { throwaway_run_stream -v "$S_VOLUME":/src:ro alpine tar -C /src -cf - .; } ;;
esac
if pre_producer 2>>"$LOG" \
     | zstd -q -19 >"$PRE_DUMP.partial" 2>>"$LOG" && [ "$(stat -c %s "$PRE_DUMP.partial")" -gt 64 ]; then
  mv "$PRE_DUMP.partial" "$PRE_DUMP"
  say "$SLUG/$STORE: pre-restore snapshot ok ($(numfmt --to=iec "$(stat -c %s "$PRE_DUMP")"))"
else
  rm -f "$PRE_DUMP.partial"; abort "pre-restore snapshot failed — nothing touched"
fi

# --- 2. decrypt + decompress the target archive ---------------------------
PLAIN="$WORK/restore.dump"
DEC="$ARCHIVE"
if [[ "$ARCHIVE" == *.age ]]; then
  DEC="$WORK/dec.zst"
  age -d -i "$KEYS_DIR/$SLUG.age" -o "$DEC" "$ARCHIVE" 2>>"$LOG" || abort "age decrypt failed"
fi
zstd -dqf "$DEC" -o "$PLAIN" 2>>"$LOG" || abort "decompress failed"
[ "$(stat -c %s "$PLAIN")" -gt 64 ] || abort "decompressed archive is empty"

# --- 3. restore, live -----------------------------------------------------
# Postgres: reset the public schema first so the result is EXACTLY the archive
# (a table added after this backup won't linger; the pre-restore dump is an
# exact snapshot too, so the undo is exact). Files: clear the target then
# extract, same exactness.
DB="${S_DB:-\$POSTGRES_DB}"
COUNT=0; UNIT=tables
case "$MODE" in
  pg-remote)
    say "$SLUG/$STORE: restoring into the LIVE database now (public schema reset)"
    # The forced command does the schema reset + pg_restore + a table-count sanity
    # check itself (it exits non-zero on 0 tables). Capture its report for COUNT.
    RREPORT=$(ssh -F "$SSH_CONFIG" -o BatchMode=yes -o ConnectTimeout=30 "$RESTORE_ALIAS" \
               "backup-restore" <"$PLAIN" 2>&1) || { echo "$RREPORT" >>"$LOG"; abort "remote backup-restore failed: $(echo "$RREPORT" | tail -1)"; }
    echo "$RREPORT" >>"$LOG"
    COUNT=$(echo "$RREPORT" | sed -n 's/.*done — \([0-9]\+\) table.*/\1/p' | tail -1); COUNT=${COUNT:-0}
    ;;
  pg-container)
    say "$SLUG/$STORE: restoring into the LIVE database now (public schema reset)"
    docker exec -i "$S_CONTAINER" sh -c \
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "'"$DB"'" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"' \
      >>"$LOG" 2>&1 || abort "could not reset the public schema — nothing restored, DB unchanged"
    docker exec -i "$S_CONTAINER" sh -c \
      'pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "'"$DB"'"' \
      <"$PLAIN" >>"$LOG" 2>&1 || say "$SLUG/$STORE: pg_restore reported errors (often benign — checking result)"
    COUNT=$(docker exec "$S_CONTAINER" sh -c \
      'psql -U "$POSTGRES_USER" -d "'"$DB"'" -tAc "select count(*) from pg_tables where schemaname not in ('"'"'pg_catalog'"'"','"'"'information_schema'"'"')"' \
      2>>"$LOG" | tr -dc '0-9'); COUNT=${COUNT:-0}
    ;;
  files-path|files-volume)
    UNIT=files
    # Same mechanism for a bind-mount path and a docker volume: a throwaway
    # container (--rm --network none, no --name, this run's label — it can see
    # ONLY this one mount) clears the target and untars the archive as root, so
    # container-owned files come back with their exact ownership. guard_path
    # already proved $S_PATH is under ~/unified-services; the volume was
    # docker-inspected. The path tar carries a `<basename>/` prefix (strip it);
    # the volume tar is rooted at `.`.
    if [ "$MODE" = files-path ]; then MOUNT="$S_PATH"; STRIP=--strip-components=1; else MOUNT="$S_VOLUME"; STRIP=; fi
    say "$SLUG/$STORE: clearing + restoring $MOUNT"
    # shellcheck disable=SC2086
    throwaway_run_stream -i -v "$MOUNT":/dst alpine \
      sh -c "find /dst -mindepth 1 -delete && tar -xf - -C /dst $STRIP" <"$PLAIN" >>"$LOG" 2>&1 \
      || abort "restore into $MOUNT failed — the pre-restore snapshot at $PRE_DUMP is your rollback"
    COUNT=$(throwaway_run_stream -v "$MOUNT":/dst:ro alpine sh -c 'find /dst -type f | wc -l' 2>>"$LOG" | tr -dc '0-9'); COUNT=${COUNT:-0}
    ;;
esac

if [ "${COUNT:-0}" -gt 0 ]; then
  # Bounce the consumers so they re-read the restored data (files/volume only).
  for c in $S_RESTART; do
    say "$SLUG/$STORE: docker restart $c"
    restart_named "$c" >>"$LOG" 2>&1 || say "$SLUG/$STORE: restart of $c failed — do it by hand"
  done
  say "$SLUG/$STORE: RESTORED — $COUNT $UNIT. Undo: fleet-restore.sh $SLUG $STORE $(basename "$PRE_DUMP")"
  receipt true "$ARCHIVE" "$PRE_DUMP" "$COUNT"
  prune_glob "$OUT" "${STORE}-pre-restore-*" 10
  # BXD-41: the new pre-restore snapshot is a restore point too — refresh the index.
  write_archive_index "$SLUG" "$STORE" "$OUT"
  exit 0
else
  abort "restore produced 0 $UNIT — the pre-restore snapshot at $PRE_DUMP is your rollback"
fi
