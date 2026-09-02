#!/usr/bin/env bash
# ============================================================================
# fleet-secrets-backup.sh  —  IDEA-10 Layer 6 / CR-31
#
# Bundles the state that is correctly kept out of git — env files, SSH keys,
# the Nebula node cert + key — encrypts it, and writes it next to the fleet's
# other backups as  <destination>/_secrets/secrets-<date>.tar.zst.age
#
# Config:  $CONTROL_ROOM_DATA/infra/secrets-backup.yml
#   destination:    id into infra/destinations.yml
#   keep_last:      how many bundles to retain
#   age_recipient:  public key; the identity is backup-keys/_secrets.age
#   paths:          files/dirs/globs to include (root-owned read via sudo)
#
# Always age-encrypted — there is no plaintext mode. bosun-x reads the receipt
# this writes and shows a "fleet secrets" row on /backups; it never runs this.
# ============================================================================
set -uo pipefail

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_ROOM_DATA=${CONTROL_ROOM_DATA:-$(dirname "$_repo_root")/control-room-data}
[ -d "$CONTROL_ROOM_DATA" ] || CONTROL_ROOM_DATA=${DATA_DIR:-$HOME/control-room-data}
RECEIPTS_DIR=${BACKUP_RECEIPTS:-$HOME/backup-receipts}
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}
CONFIG="$CONTROL_ROOM_DATA/infra/secrets-backup.yml"
IDENTITY="$CONTROL_ROOM_DATA/backup-keys/_secrets.age"

mkdir -p "$(dirname "$LOG")" "$RECEIPTS_DIR"
export BACKUP_RECEIPTS="$RECEIPTS_DIR"
# shellcheck source=lib/docker-safe.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/job-marker.sh"

now() { date -u +%FT%TZ; }
say() { echo "[$(now)] secrets-backup: $*" | tee -a "$LOG"; }
DATE=$(date -u +%Y%m%d)

receipt() { # <ok> <bytes> <sha> <archive> <files> [error]
  local dir="$RECEIPTS_DIR/_secrets"
  mkdir -p "$dir"
  local rec
  rec=$(jq -nc --arg store bundle --arg finished "$(now)" --argjson ok "$1" \
    --argjson bytes "${2:-0}" --arg sha "$3" --arg archive "$4" --argjson files "${5:-0}" \
    --arg error "${6:-}" \
    '{store:$store, finished_at:$finished, ok:$ok, bytes:$bytes, sha256:$sha, archive:$archive, files:$files}
     + (if $error=="" then {} else {error:$error} end)')
  echo "$rec" >>"$dir/log.jsonl"
  echo "$rec" >"$dir/bundle.latest.json"
}

fail() { say "FAILED: $*"; receipt false 0 "" "" 0 "$*"; exit 1; }

exec 9>"/tmp/fleet-secrets-backup.lock"
flock -n 9 || { say "another run in progress; skipping"; exit 0; }
job_begin fleet-secrets-backup
trap '_job_finish' EXIT

[ -f "$CONFIG" ] || fail "no config at $CONFIG"
[ -f "$IDENTITY" ] || fail "no restore key at $IDENTITY — run: age-keygen -o $IDENTITY (0600), and save a copy in the password manager"

# --- read the config -------------------------------------------------------
eval "$(python3 - "$CONFIG" "$CONTROL_ROOM_DATA" <<'PY'
import sys, yaml, shlex, os
cfg = yaml.safe_load(open(sys.argv[1])) or {}
data_dir = sys.argv[2]
dests = {d["id"]: d for d in (yaml.safe_load(open(f"{data_dir}/infra/destinations.yml")) or {}).get("destinations", [])}
d = dests.get(cfg.get("destination"), {})
print(f"CFG_RECIPIENT={shlex.quote(str(cfg.get('age_recipient','')))}")
print(f"CFG_KEEP={int(cfg.get('keep_last', 14))}")
print(f"DEST_PATH={shlex.quote(str(d.get('path','')))}")
print(f"DEST_MOUNT={shlex.quote(str(d.get('mount','')))}")
print(f"DEST_SENTINEL={shlex.quote(str(d.get('sentinel','')))}")
print("CFG_PATHS=(" + " ".join(shlex.quote(os.path.expanduser(str(p))) for p in (cfg.get("paths") or [])) + ")")
PY
)"

[ -n "${CFG_RECIPIENT:-}" ] && [[ "$CFG_RECIPIENT" == age1* ]] || fail "age_recipient not set in $CONFIG"
[ -n "${DEST_PATH:-}" ] || fail "destination not resolved from destinations.yml"

# --- guard the destination ----------------------------------------------------
[ -n "$DEST_MOUNT" ] && ! mountpoint -q "$DEST_MOUNT" && fail "$DEST_MOUNT is not mounted"
[ -n "$DEST_SENTINEL" ] && [ ! -f "$DEST_PATH/$DEST_SENTINEL" ] && fail "sentinel $DEST_PATH/$DEST_SENTINEL missing"
OUT="$DEST_PATH/_secrets"
guard_path "$OUT" "$DEST_PATH"
export BOSUN_PRUNE_ROOT="$DEST_PATH"
mkdir -p "$OUT" || fail "cannot create $OUT"

# --- resolve the file list (globs, existence, sudo for root-owned) -----------
LIST=$(mktemp /tmp/fleet-secrets.XXXXXX) || fail "mktemp failed"
trap 'guard_path "$LIST" /tmp; rm -f -- "$LIST"; _job_finish' EXIT
NEED_SUDO=0
count=0
for pat in "${CFG_PATHS[@]}"; do
  matched=0
  for p in $pat; do          # unquoted: glob expansion
    if [ -e "$p" ]; then
      matched=1; count=$((count+1)); echo "$p" >>"$LIST"
      # need sudo if this path — or anything under it — isn't readable by us
      # (e.g. /etc/nebula/host.key is root:root 0600)
      if [ -n "$(find "$p" \( ! -readable -o -type d ! -executable \) -print -quit 2>/dev/null)" ]; then
        NEED_SUDO=1
      fi
    elif sudo -n test -e "$p" 2>/dev/null; then
      matched=1; count=$((count+1)); echo "$p" >>"$LIST"; NEED_SUDO=1
    fi
  done
  [ "$matched" = 0 ] && say "skip (not found): $pat"
done
[ "$count" -gt 0 ] || fail "no source paths matched"
say "$count path(s) to bundle$( [ "$NEED_SUDO" = 1 ] && echo ' (sudo for root-owned)')"

# --- bundle: tar -> zstd -> age --------------------------------------------
ARCHIVE="$OUT/secrets-${DATE}.tar.zst.age"
TMP="$ARCHIVE.partial"
TAR=(tar -cf - -P --absolute-names --ignore-failed-read --files-from "$LIST")
[ "$NEED_SUDO" = 1 ] && TAR=(sudo -n "${TAR[@]}")

if "${TAR[@]}" 2>>"$LOG" | zstd -q -19 2>>"$LOG" | age -r "$CFG_RECIPIENT" >"$TMP" 2>>"$LOG"; then :; else
  rm -f "$TMP"; fail "tar|zstd|age pipeline failed"
fi

bytes=$(stat -c %s "$TMP" 2>/dev/null || echo 0)
[ "$bytes" -ge 64 ] || { rm -f "$TMP"; fail "archive suspiciously small ($bytes B)"; }
sha=$(sha256sum "$TMP" | cut -d' ' -f1)
mv "$TMP" "$ARCHIVE"
say "ok — $(numfmt --to=iec "$bytes"), $count paths -> $ARCHIVE"
receipt true "$bytes" "$sha" "$ARCHIVE" "$count"

# --- prune (docker-safe.sh: bounded to $OUT, files only, name-pattern) --------
prune_glob "$OUT" "secrets-*.tar.zst.age" "${CFG_KEEP:-14}"
