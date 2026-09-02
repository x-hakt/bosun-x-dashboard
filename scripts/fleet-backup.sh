#!/usr/bin/env bash
# ============================================================================
# fleet-backup.sh  —  IDEA-10 / CR-11, the fleet backup agent
#
# Reads the backup config the dashboard owns:
#   $CONTROL_ROOM_DATA/infra/destinations.yml
#   $CONTROL_ROOM_DATA/projects/<slug>/backups.yml   (method: agent only)
# and for every declared store: dumps it, writes the archive to the backup destination,
# prunes to keep_last, and writes a receipt the dashboard can read.
#
# This is the credential-holding half of the "operator" split (Layer 5):
# The dashboard writes config + a backup.request file and never holds secrets;
# this script does the actual pg_dump / tar / ssh / age work.
#
#   fleet-backup.sh              back up every agent-managed project
#   fleet-backup.sh <slug>       back up just one project
#   fleet-backup.sh --requests   process $REQUEST_DIR/*.request then exit
# ============================================================================
set -uo pipefail

# Override any of these from the cron line / a sourced env file. The data-dir
# default follows the dashboard's own layout: a `control-room-data` sibling of
# the app repo (this script lives at <repo>/scripts/fleet-backup.sh).
_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_ROOM_DATA=${CONTROL_ROOM_DATA:-$(dirname "$_repo_root")/control-room-data}
[ -d "$CONTROL_ROOM_DATA" ] || CONTROL_ROOM_DATA=${DATA_DIR:-$HOME/control-room-data}
RECEIPTS_DIR=${BACKUP_RECEIPTS:-$HOME/backup-receipts}
REQUEST_DIR=${BACKUP_REQUEST_DIR:-$CONTROL_ROOM_DATA/.backup-requests}
KEYS_DIR="$CONTROL_ROOM_DATA/backup-keys"
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}
SSH_CONFIG=${BACKUP_SSH_CONFIG:-$HOME/.ssh/config}

mkdir -p "$(dirname "$LOG")" "$RECEIPTS_DIR"
ts() { date -u +%Y%m%dT%H%M%SZ; }
now() { date -u +%FT%TZ; }
log() { echo "[$(now)] $*" >>"$LOG"; }
say() { echo "[$(now)] $*" | tee -a "$LOG"; }

RUN_TS=$(ts)
FAILURES=0

# --- the plan: one JSON line per store the agent should back up -------------
plan() {
  python3 - "$CONTROL_ROOM_DATA" "${1:-}" <<'PY'
import sys, os, json, yaml
data_dir, only = sys.argv[1], (sys.argv[2] or "")
try:
    dests = {d["id"]: d for d in (yaml.safe_load(open(f"{data_dir}/infra/destinations.yml")) or {}).get("destinations", [])}
except FileNotFoundError:
    dests = {}
proj_dir = f"{data_dir}/projects"
for slug in sorted(os.listdir(proj_dir)):
    if only and slug != only:
        continue
    bpath = f"{proj_dir}/{slug}/backups.yml"
    if not os.path.exists(bpath):
        continue
    b = yaml.safe_load(open(bpath)) or {}
    if (b.get("method") or "agent") != "agent":
        continue
    if b.get("backup_required") is False:
        continue
    dest = dests.get(b.get("destination"))
    if not dest:
        print(json.dumps({"slug": slug, "error": f"unknown destination '{b.get('destination')}'"}))
        continue
    for s in (b.get("stores") or []):
        print(json.dumps({
            "slug": slug,
            "dest_path": dest.get("path"),
            "dest_mount": dest.get("mount"),
            "dest_sentinel": dest.get("sentinel"),
            "store": s.get("name"),
            "kind": s.get("kind"),
            "container": s.get("container"),
            "ssh_alias": s.get("ssh_alias"),
            "database": s.get("database"),
            "path": s.get("path"),
            "volume": s.get("volume"),
            "keep_last": ((s.get("retention") or {}).get("keep_last") or 14),
            "age_recipient": ((s.get("encrypt") or {}).get("age_recipient")),
        }))
PY
}

# --- receipts --------------------------------------------------------------
receipt() {
  # receipt <slug> <store> <ok> <bytes> <sha256> <archive> [error]
  local slug=$1 store=$2 ok=$3 bytes=$4 sha=$5 archive=$6 err=${7:-}
  local dir="$RECEIPTS_DIR/$slug"
  mkdir -p "$dir"
  local rec
  rec=$(jq -nc --arg store "$store" --arg finished "$(now)" --argjson ok "$ok" \
    --argjson bytes "${bytes:-0}" --arg sha "$sha" --arg archive "$archive" --arg error "$err" \
    '{store:$store, finished_at:$finished, ok:$ok, bytes:$bytes, sha256:$sha, archive:$archive} + (if $error=="" then {} else {error:$error} end)')
  echo "$rec" >>"$dir/log.jsonl"
  echo "$rec" >"$dir/$store.latest.json"
}

# --- guard the destination ------------------------------------------------
guard_dest() {
  local mount=$1 path=$2 sentinel=$3
  [ -n "$mount" ] && ! mountpoint -q "$mount" && { say "GUARD: $mount is not mounted"; return 1; }
  [ -n "$sentinel" ] && [ ! -f "$path/$sentinel" ] && { say "GUARD: sentinel $path/$sentinel missing"; return 1; }
  mkdir -p "$path" || return 1
  return 0
}

# --- one store ----------------------------------------------------------------
do_store() {
  local j=$1
  local slug store kind container ssh_alias database spath volume keep age_rcpt dest_path dest_mount dest_sentinel err
  slug=$(jq -r '.slug' <<<"$j")
  err=$(jq -r '.error // empty' <<<"$j")
  if [ -n "$err" ]; then say "$slug: $err"; ((FAILURES++)); return; fi
  store=$(jq -r '.store' <<<"$j"); kind=$(jq -r '.kind' <<<"$j")
  container=$(jq -r '.container // empty' <<<"$j"); ssh_alias=$(jq -r '.ssh_alias // empty' <<<"$j")
  database=$(jq -r '.database // empty' <<<"$j"); spath=$(jq -r '.path // empty' <<<"$j")
  volume=$(jq -r '.volume // empty' <<<"$j"); keep=$(jq -r '.keep_last' <<<"$j")
  age_rcpt=$(jq -r '.age_recipient // empty' <<<"$j")
  dest_path=$(jq -r '.dest_path' <<<"$j"); dest_mount=$(jq -r '.dest_mount // empty' <<<"$j")
  dest_sentinel=$(jq -r '.dest_sentinel // empty' <<<"$j")

  guard_dest "$dest_mount" "$dest_path" "$dest_sentinel" || { receipt "$slug" "$store" false 0 "" "" "destination guard failed"; ((FAILURES++)); return; }

  local out="$dest_path/$slug"
  mkdir -p "$out"

  # extension + producer command
  local ext producer
  case "$kind" in
    postgres)
      ext="dump.zst"
      if [ -n "$ssh_alias" ]; then
        # remote store: the host's forced-command key runs a backup-dump script
        # that emits `pg_dump -Fc` on stdout (Layer 2). `-n` is essential —
        # without it ssh reads stdin, which here is the plan pipe feeding the
        # caller's `while read` loop, and eats the rest of the projects.
        producer=(ssh -n -F "$SSH_CONFIG" -o BatchMode=yes -o ConnectTimeout=30 "$ssh_alias" backup-dump)
      elif [ -n "$container" ]; then
        producer=(docker exec "$container" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"')
      else
        receipt "$slug" "$store" false 0 "" "" "postgres store has neither ssh_alias nor container"; ((FAILURES++)); return
      fi
      ;;
    files|redis)
      ext="tar.zst"
      if [ -n "$spath" ]; then
        producer=(tar -C "$(dirname "$spath")" -cf - "$(basename "$spath")")
      elif [ -n "$volume" ]; then
        producer=(docker run --rm -v "$volume":/src:ro alpine tar -C /src -cf - .)
      else
        receipt "$slug" "$store" false 0 "" "" "files store has neither path nor volume"; ((FAILURES++)); return
      fi
      ;;
    *) receipt "$slug" "$store" false 0 "" "" "unknown kind '$kind'"; ((FAILURES++)); return ;;
  esac

  [ -n "$age_rcpt" ] && ext="$ext.age"
  local archive="$out/${store}-${RUN_TS}.${ext}"
  local tmp="$archive.partial"

  say "$slug/$store: -> $archive"
  # pipeline: producer | zstd | [age] > tmp
  if [ -n "$age_rcpt" ]; then
    if "${producer[@]}" 2>>"$LOG" | zstd -q -19 --long 2>>"$LOG" | age -r "$age_rcpt" >"$tmp" 2>>"$LOG"; then :; else
      rm -f "$tmp"; say "$slug/$store: FAILED"; receipt "$slug" "$store" false 0 "" "" "pipeline failed"; ((FAILURES++)); return
    fi
  else
    if "${producer[@]}" 2>>"$LOG" | zstd -q -19 --long >"$tmp" 2>>"$LOG"; then :; else
      rm -f "$tmp"; say "$slug/$store: FAILED"; receipt "$slug" "$store" false 0 "" "" "pipeline failed"; ((FAILURES++)); return
    fi
  fi

  # sanity: non-empty
  local bytes; bytes=$(stat -c %s "$tmp" 2>/dev/null || echo 0)
  if [ "$bytes" -lt 64 ]; then
    rm -f "$tmp"; say "$slug/$store: archive suspiciously small ($bytes B)"; receipt "$slug" "$store" false "$bytes" "" "" "archive too small"; ((FAILURES++)); return
  fi
  local sha; sha=$(sha256sum "$tmp" | cut -d' ' -f1)
  mv "$tmp" "$archive"
  say "$slug/$store: ok, $(numfmt --to=iec "$bytes")"
  receipt "$slug" "$store" true "$bytes" "$sha" "$archive"

  # prune: keep the newest $keep archives for this store
  local kept=0
  # shellcheck disable=SC2012
  ls -1t "$out/${store}-"*.* 2>/dev/null | while read -r f; do
    kept=$((kept + 1))
    [ "$kept" -gt "$keep" ] && rm -f "$f" && say "$slug/$store: pruned $(basename "$f")"
  done
}

# --- requests -------------------------------------------------------------
process_requests() {
  [ -d "$REQUEST_DIR" ] || exit 0
  shopt -s nullglob
  for req in "$REQUEST_DIR"/*.request; do
    local slug; slug=$(basename "$req" .request)
    say "request: $slug"
    rm -f "$req"
    run_for "$slug"
  done
}

run_for() {
  local only=${1:-}
  local n=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    n=$((n + 1))
    do_store "$line"
  done < <(plan "$only")
  say "done: $n store(s), $FAILURES failure(s)${only:+ (project: $only)}"
}

# --- entry --------------------------------------------------------------------
exec 9>"/tmp/fleet-backup.lock"
flock -n 9 || { say "another run in progress; skipping"; exit 0; }

case "${1:-}" in
  --requests) process_requests ;;
  "")         run_for "" ;;
  *)          run_for "$1" ;;
esac

exit $(( FAILURES > 0 ? 1 : 0 ))
