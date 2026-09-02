#!/usr/bin/env bash
# ============================================================================
# fleet-offsite-push.sh  —  IDEA-10 Layer 2 phase 2 / CR-32
#
# Caspar and the NAS share one room; a fire or theft takes both. This copies the
# CRITICAL SET off-site to object storage, after the nightly local backup:
#
#   - the newest gp-forms Postgres dump        (already age-encrypted)
#   - the newest fleet secrets bundle          (already age-encrypted)
#   - a fresh bundle of control-room-data       (tar|zstd|age here)
#
# Everything lands age-encrypted (the bucket is third-party). Uses rclone; the
# bucket credentials come from a file the AGENT reads (destinations.yml
# `credential_ref`), never bosun-x.
#
# Config:
#   $CONTROL_ROOM_DATA/infra/destinations.yml   — the b2/s3 destination
#   $CONTROL_ROOM_DATA/infra/offsite.yml        — enabled, keep_last, recipient
#
# No rclone / not configured / disabled  → writes an "unconfigured" receipt and
# exits 0. bosun-x shows the offsite column as "not set up" rather than failing.
# ============================================================================
set -uo pipefail

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_ROOM_DATA=${CONTROL_ROOM_DATA:-$(dirname "$_repo_root")/control-room-data}
[ -d "$CONTROL_ROOM_DATA" ] || CONTROL_ROOM_DATA=${DATA_DIR:-$HOME/control-room-data}
RECEIPTS_DIR=${BACKUP_RECEIPTS:-$HOME/backup-receipts}
LOG=${BACKUP_LOG:-$HOME/.local/state/fleet-backup.log}
OFFSITE_CONFIG="$CONTROL_ROOM_DATA/infra/offsite.yml"

mkdir -p "$(dirname "$LOG")" "$RECEIPTS_DIR/_offsite"
export BACKUP_RECEIPTS="$RECEIPTS_DIR"
# shellcheck source=lib/docker-safe.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/job-marker.sh"

now() { date -u +%FT%TZ; }
say() { echo "[$(now)] offsite: $*" | tee -a "$LOG"; }
DATE=$(date -u +%Y%m%d)
WORK=$(mktemp -d /tmp/fleet-offsite.XXXXXX) || { echo "mktemp failed" >&2; exit 1; }

item_receipt() { # <name> <ok|null> <remote-path> [error]
  local f="$RECEIPTS_DIR/_offsite/$1.latest.json"
  jq -nc --arg item "$1" --arg at "$(now)" --arg remote "${3:-}" --arg error "${4:-}" \
    --argjson ok "$2" \
    '{item:$item, pushed_at:$at, remote:$remote, ok:$ok} + (if $error=="" then {} else {error:$error} end)' \
    | tee "$f" >>"$RECEIPTS_DIR/_offsite/log.jsonl"
}

unconfigured() { # <reason>
  say "not configured: $1"
  for n in gp-forms secrets control-room-data; do item_receipt "$n" null "" "$1"; done
  exit 0
}

exec 9>"/tmp/fleet-offsite-push.lock"
flock -n 9 || { say "another run in progress; skipping"; exit 0; }
job_begin fleet-offsite-push
trap 'guard_path "$WORK" /tmp; rm -rf -- "$WORK"; _job_finish' EXIT

command -v rclone >/dev/null 2>&1 || unconfigured "rclone not installed"
[ -f "$OFFSITE_CONFIG" ] || unconfigured "no infra/offsite.yml"

eval "$(python3 - "$OFFSITE_CONFIG" "$CONTROL_ROOM_DATA" <<'PY'
import sys, yaml, shlex
o = yaml.safe_load(open(sys.argv[1])) or {}
data_dir = sys.argv[2]
dests = {d["id"]: d for d in (yaml.safe_load(open(f"{data_dir}/infra/destinations.yml")) or {}).get("destinations", [])}
d = dests.get(o.get("destination"), {})
q = shlex.quote
print(f"O_ENABLED={q(str(o.get('enabled', False)).lower())}")
print(f"O_KEEP={int(o.get('keep_last', 30))}")
print(f"O_RECIPIENT={q(str(o.get('age_recipient','')))}")
print(f"O_DATA_REPO={q(str(o.get('data_repo', data_dir)))}")
print(f"D_KIND={q(str(d.get('kind','')))}")
print(f"D_REMOTE={q(str(d.get('rclone_remote','')))}")
print(f"D_BUCKET={q(str(d.get('bucket','')))}")
print(f"D_CRED={q(str(d.get('credential_ref','')))}")
PY
)"

[ "${O_ENABLED:-false}" = "true" ] || unconfigured "offsite.yml: enabled is not true"
[ -n "${D_REMOTE:-}" ] && [ -n "${D_BUCKET:-}" ] || unconfigured "destination has no rclone_remote / bucket"
[[ "${O_RECIPIENT:-}" == age1* ]] || unconfigured "offsite.yml: age_recipient not set"
[ -n "${D_CRED:-}" ] && [ -r "${D_CRED/#\~/$HOME}" ] || unconfigured "credential_ref not readable: ${D_CRED:-unset}"

export RCLONE_CONFIG="${D_CRED/#\~/$HOME}"
DEST="$D_REMOTE:$D_BUCKET"
NAS="/mnt/nas-media/Backups"
FAIL=0

push() { # <local-file> <remote-subdir> <item-name>
  local src=$1 sub=$2 name=$3
  case "$sub" in gp-forms|_secrets|control-room-data) : ;; *) say "push: bad subdir '$sub'"; FAIL=1; return ;; esac
  if rclone copy --immutable "$src" "$DEST/$sub/" --log-file "$LOG" --log-level INFO; then
    say "$name -> $DEST/$sub/$(basename "$src")"
    item_receipt "$name" true "$sub/$(basename "$src")"
    # prune: keep newest $O_KEEP in that subdir (only ever files rclone itself
    # lists under this one bucket path; the bucket also has object-lock on)
    rclone lsf "$DEST/$sub/" --files-only 2>/dev/null | sort -r | tail -n +"$((O_KEEP + 1))" \
      | while read -r old; do
          [ -n "$old" ] || continue
          rclone deletefile "$DEST/$sub/$old" 2>>"$LOG" && say "pruned $sub/$old"
        done
  else
    say "$name: rclone copy FAILED"; item_receipt "$name" false "" "rclone copy failed"; FAIL=1
  fi
}

# 1. gp-forms dump (already .age)
gpf=$(ls -1t "$NAS"/gp-forms/gp-forms-postgres-*.age 2>/dev/null | head -1)
[ -n "$gpf" ] && push "$gpf" gp-forms gp-forms || { say "gp-forms: no local archive"; item_receipt gp-forms false "" "no local archive"; FAIL=1; }

# 2. secrets bundle (already .age)
sec=$(ls -1t "$NAS"/_secrets/secrets-*.tar.zst.age 2>/dev/null | head -1)
[ -n "$sec" ] && push "$sec" _secrets secrets || { say "secrets: no local bundle"; item_receipt secrets false "" "no local bundle"; FAIL=1; }

# 3. control-room-data — bundle it fresh, encrypt, push
crd="$WORK/control-room-data-${DATE}.tar.zst.age"
if tar -C "$(dirname "$O_DATA_REPO")" -cf - "$(basename "$O_DATA_REPO")" 2>>"$LOG" \
     | zstd -q -19 2>>"$LOG" | age -r "$O_RECIPIENT" >"$crd" 2>>"$LOG"; then
  push "$crd" control-room-data control-room-data
else
  say "control-room-data: bundle FAILED"; item_receipt control-room-data false "" "bundle failed"; FAIL=1
fi

say "done: $([ "$FAIL" = 0 ] && echo "all pushed" || echo "$FAIL item(s) failed")"
exit "$FAIL"
