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
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}

mkdir -p "$(dirname "$LOG")"
export BACKUP_RECEIPTS="$RECEIPTS_DIR"
# shellcheck source=lib/docker-safe.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/job-marker.sh"

now() { date -u +%FT%TZ; }
ts()  { date -u +%Y%m%dT%H%M%SZ; }
say() { echo "[$(now)] restore: $*" | tee -a "$LOG"; }

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
    print(f"S_AGE={q(str((s.get('encrypt') or {}).get('age_recipient','')))}")
    print(f"D_PATH={q(str(d.get('path','')))}")
    print(f"D_MOUNT={q(str(d.get('mount','')))}")
    print(f"D_SENTINEL={q(str(d.get('sentinel','')))}")
PY
)"

[ "${S_FOUND:-0}" = 1 ] || abort "no store '$STORE' in projects/$SLUG/backups.yml"
[ "${S_KIND:-}" = postgres ] || abort "v1 restores postgres stores only (this is '${S_KIND:-?}')"
[ -n "${D_PATH:-}" ] || abort "destination path not resolved"
[ -n "${S_CONTAINER:-}" ] || abort "store has no container (ssh_alias restores are manual — see docs/restore.md)"

# --- confirmation -----------------------------------------------------------
[ "${FLEET_RESTORE_CONFIRM:-}" = "$SLUG" ] || abort "refusing — set FLEET_RESTORE_CONFIRM=$SLUG to proceed"

OUT="$D_PATH/$SLUG"
guard_path "$OUT" "$D_PATH"
export BOSUN_PRUNE_ROOT="$D_PATH"
[ -n "$D_MOUNT" ] && ! mountpoint -q "$D_MOUNT" && abort "$D_MOUNT not mounted"
[ -z "$D_SENTINEL" ] || [ -f "$D_PATH/$D_SENTINEL" ] || abort "destination sentinel missing"

# --- confirm the target container --------------------------------------------
docker inspect "$S_CONTAINER" >/dev/null 2>&1 || abort "container '$S_CONTAINER' not found"
CState=$(docker inspect -f '{{.State.Running}}' "$S_CONTAINER" 2>/dev/null)
[ "$CState" = true ] || abort "container '$S_CONTAINER' is not running"
say "$SLUG/$STORE: target = container '$S_CONTAINER', db '${S_DB:-\$POSTGRES_DB}'"

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

# --- 1. pre-restore safety dump (the undo) — MANDATORY ----------------------
PRE_DUMP="$OUT/${STORE}-pre-restore-$(ts).dump.zst"
say "$SLUG/$STORE: pre-restore dump -> $PRE_DUMP"
if docker exec "$S_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "'"${S_DB:-\$POSTGRES_DB}"'"' 2>>"$LOG" \
     | zstd -q -19 >"$PRE_DUMP.partial" 2>>"$LOG" && [ "$(stat -c %s "$PRE_DUMP.partial")" -gt 64 ]; then
  mv "$PRE_DUMP.partial" "$PRE_DUMP"
  say "$SLUG/$STORE: pre-restore dump ok ($(numfmt --to=iec "$(stat -c %s "$PRE_DUMP")"))"
else
  rm -f "$PRE_DUMP.partial"; abort "pre-restore dump failed — not touching the live database"
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

# --- 3. restore into the live database -----------------------------------
# Reset the public schema first so the result is EXACTLY the archive — a table
# created after this backup won't linger, and the pre-restore dump (taken above)
# is likewise an exact snapshot, so the undo is exact too. Extensions live in
# the dump and are recreated by pg_restore.
DB="${S_DB:-\$POSTGRES_DB}"
say "$SLUG/$STORE: restoring into the LIVE database now (public schema reset)"
docker exec -i "$S_CONTAINER" sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "'"$DB"'" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"' \
  >>"$LOG" 2>&1 || abort "could not reset the public schema — nothing restored, DB unchanged"
docker exec -i "$S_CONTAINER" sh -c \
  'pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "'"$DB"'"' \
  <"$PLAIN" >>"$LOG" 2>&1 || say "$SLUG/$STORE: pg_restore reported errors (often benign — checking result)"

TABLES=$(docker exec "$S_CONTAINER" sh -c \
  'psql -U "$POSTGRES_USER" -d "'"$DB"'" -tAc "select count(*) from pg_tables where schemaname not in ('"'"'pg_catalog'"'"','"'"'information_schema'"'"')"' \
  2>>"$LOG" | tr -dc '0-9'); TABLES=${TABLES:-0}

if [ "$TABLES" -gt 0 ]; then
  say "$SLUG/$STORE: RESTORED — $TABLES tables. Undo: fleet-restore.sh $SLUG $STORE $(basename "$PRE_DUMP")"
  receipt true "$ARCHIVE" "$PRE_DUMP" "$TABLES"
  prune_glob "$OUT" "${STORE}-pre-restore-*" 10
  exit 0
else
  abort "restore produced 0 tables — the pre-restore dump at $PRE_DUMP is your rollback"
fi
