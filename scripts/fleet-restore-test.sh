#!/usr/bin/env bash
# ============================================================================
# fleet-restore-test.sh  —  IDEA-10 Layer 3 / CR-28
#
# Weekly proof that the backups actually restore, not just that they ran.
# For every latest receipt fleet-backup.sh wrote:
#   - check the archive still exists on the destination and its sha256 matches
#   - decrypt (age) + decompress (zstd)
#   - Postgres:  pg_restore --list for the TOC, then a real pg_restore into a
#                throwaway postgres container + count tables and live rows
#   - files/redis:  tar -t listing (structure is intact)
# and write  <RECEIPTS_DIR>/<slug>/<store>.restore.json  — the dashboard reads
# it as "last verified restore".
#
#   fleet-restore-test.sh            test every store
#   fleet-restore-test.sh <slug>     test one project's stores
# ============================================================================
set -uo pipefail

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_ROOM_DATA=${CONTROL_ROOM_DATA:-$(dirname "$_repo_root")/control-room-data}
[ -d "$CONTROL_ROOM_DATA" ] || CONTROL_ROOM_DATA=${DATA_DIR:-$HOME/control-room-data}
RECEIPTS_DIR=${BACKUP_RECEIPTS:-$HOME/backup-receipts}
KEYS_DIR="$CONTROL_ROOM_DATA/backup-keys"
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}
PG_IMAGE=${RESTORE_TEST_PG_IMAGE:-postgres:17-alpine}

ONLY=${1:-}
mkdir -p "$(dirname "$LOG")"

export BACKUP_RECEIPTS="$RECEIPTS_DIR"
# shellcheck source=lib/docker-safe.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/job-marker.sh"

WORK=$(mktemp -d /tmp/fleet-restore-test.XXXXXX) || { echo "mktemp failed" >&2; exit 1; }

cleanup() {
  throwaway_rm_all              # only this run's --network-none postgres containers
  guard_path "$WORK" /tmp
  rm -rf -- "$WORK"
}
trap 'cleanup; _job_finish' EXIT

now() { date -u +%FT%TZ; }
say() { echo "[$(now)] restore-test: $*" | tee -a "$LOG"; }

FAIL=0
TESTED=0

write_receipt() { # <slug> <store> <json>
  local dir="$RECEIPTS_DIR/$1"
  mkdir -p "$dir"
  printf '%s\n' "$3" > "$dir/$2.restore.json"
  printf '%s\n' "$3" >> "$dir/$2.restore-log.jsonl"
}

test_store() { # <receipt-file>
  local rf=$1
  local slug store archive sha
  slug=$(basename "$(dirname "$rf")")
  store=$(jq -r '.store // empty' "$rf" 2>/dev/null) || return
  archive=$(jq -r '.archive // empty' "$rf" 2>/dev/null)
  sha=$(jq -r '.sha256 // empty' "$rf" 2>/dev/null)
  [ -z "$store" ] || [ -z "$archive" ] && return
  [ -n "$ONLY" ] && [ "$slug" != "$ONLY" ] && return
  TESTED=$((TESTED + 1))

  local ok=false err="" kind=unknown checksum_ok=false
  local toc=0 tables=0 rows=0 age_h=0

  if [ ! -f "$archive" ]; then
    err="archive missing on destination"
  else
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$archive") ) / 3600 ))
    if [ -n "$sha" ]; then
      [ "$(sha256sum "$archive" | cut -d' ' -f1)" = "$sha" ] && checksum_ok=true || err="checksum mismatch — the destination copy changed or is corrupt"
    fi
  fi

  # decrypt + decompress -> $WORK/plain
  local plain="$WORK/${slug}_${store}.plain"
  if [ -z "$err" ]; then
    local dec="$archive"
    if [[ "$archive" == *.age ]]; then
      dec="$WORK/${slug}_${store}.dec"
      age -d -i "$KEYS_DIR/$slug.age" -o "$dec" "$archive" 2>>"$LOG" || err="age decrypt failed (is $KEYS_DIR/$slug.age present?)"
    fi
    [ -z "$err" ] && { zstd -dqf "$dec" -o "$plain" 2>>"$LOG" || err="zstd decompress failed"; }
  fi

  # what is it, from the archive name
  case "$archive" in
    *.dump.zst|*.dump.zst.age) kind=postgres ;;
    *.tar.zst|*.tar.zst.age)   kind=files ;;
  esac

  if [ -z "$err" ] && [ "$kind" = postgres ]; then
    # throwaway_run_d forces -d --rm --network none --label bosun.throwaway=<run id>.
    # No --name, no network — it cannot collide with or reach a real container.
    local cid=""
    cid=$(throwaway_run_d -v "$WORK":/work:ro -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore "$PG_IMAGE" 2>>"$LOG")
    if [ -z "$cid" ]; then
      err="could not start $PG_IMAGE"
    else
      # The postgres image starts, runs init, STOPS, then starts for real. Wait
      # for `select 1` to succeed a few times running so we're past that restart.
      local i ready=0
      for i in $(seq 1 60); do
        if docker exec "$cid" psql -U postgres -d restore -tAc 'select 1' 2>/dev/null | grep -q 1; then
          ready=$((ready + 1)); [ "$ready" -ge 3 ] && break
        else
          ready=0
        fi
        sleep 1
      done
      [ "$ready" -ge 3 ] || err="postgres container never became stably ready"
    fi
    if [ -z "$err" ]; then
      toc=$(docker exec "$cid" pg_restore --list "/work/$(basename "$plain")" 2>>"$LOG" | grep -c '^[0-9;]' || true)
      docker exec "$cid" pg_restore -U postgres -d restore --no-owner --no-privileges "/work/$(basename "$plain")" >>"$LOG" 2>&1 || true
      tables=$(docker exec "$cid" psql -U postgres -d restore -tAc "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')" 2>>"$LOG" | tr -dc '0-9'); tables=${tables:-0}
      docker exec "$cid" psql -U postgres -d restore -c "analyze" >>"$LOG" 2>&1 || true
      rows=$(docker exec "$cid" psql -U postgres -d restore -tAc "select coalesce(sum(n_live_tup),0)::bigint from pg_stat_user_tables" 2>>"$LOG" | tr -dc '0-9'); rows=${rows:-0}
      if [ "$toc" -gt 0 ] && [ "$tables" -gt 0 ]; then ok=true; else err="restore produced ${tables} tables / ${toc} TOC entries"; fi
    fi
    throwaway_rm "$cid"
  elif [ -z "$err" ] && [ "$kind" = files ]; then
    local n
    n=$(tar -tf "$plain" 2>>"$LOG" | grep -c . || true)
    rows=$n
    [ "$n" -gt 0 ] && ok=true || err="archive lists no entries"
  elif [ -z "$err" ]; then
    err="unrecognised archive type"
  fi

  [ "$ok" = true ] || FAIL=$((FAIL + 1))
  local json
  json=$(jq -nc \
    --arg store "$store" --arg tested "$(now)" --arg archive "$archive" \
    --argjson age "$age_h" --arg kind "$kind" --argjson checksum_ok "$checksum_ok" \
    --argjson toc "$toc" --argjson tables "$tables" --argjson rows "$rows" --argjson ok "$ok" \
    --arg error "$err" \
    '{store:$store, tested_at:$tested, archive:$archive, archive_age_h:$age, kind:$kind,
      checksum_ok:$checksum_ok, toc_entries:$toc, tables:$tables, rows:$rows, ok:$ok}
     + (if $error == "" then {} else {error:$error} end)')
  write_receipt "$slug" "$store" "$json"
  say "$slug/$store: $([ "$ok" = true ] && echo "ok — ${tables} tables, ${rows} rows, archive ${age_h}h old" || echo "FAIL — $err")"
}

exec 9>"/tmp/fleet-restore-test.lock"
flock -n 9 || { say "another run in progress; skipping"; exit 0; }
job_begin fleet-restore-test

shopt -s nullglob
for rf in "$RECEIPTS_DIR"/*/*.latest.json; do
  test_store "$rf"
done
say "done: ${TESTED} tested, ${FAIL} failure(s)"
exit $(( FAIL > 0 ? 1 : 0 ))
