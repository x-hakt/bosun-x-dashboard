#!/usr/bin/env bash
# ============================================================================
# capacity-sample.sh — BXD-62. Cron wrapper for scripts/capacity-sample.mjs:
# one run at a time, a job heartbeat bosun-x shows on /backups (job
# "capacity-sample"), and 14 days of retention for $BACKUP_RECEIPTS/_capacity.
#
#   */5 * * * * . /path/to/env; /path/to/bosun-x-dashboard/scripts/capacity-sample.sh >> /path/to/logs/capacity-sample.log 2>&1
#
# --disk (BXD-65): the daily per-project disk measurement instead (job
# "capacity-disk", writes _capacity/disk-<date>.json, keeps 15):
#   50 4 * * * . /path/to/env; /path/to/bosun-x-dashboard/scripts/capacity-sample.sh --disk >> /path/to/logs/capacity-sample.log 2>&1
#
# Read-only on every host it samples. The only thing it deletes is its own
# day files older than the newest 15, via prune_glob under _capacity/.
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BACKUP_RECEIPTS="${BACKUP_RECEIPTS:-$HOME/backup-receipts}"
OUT="$BACKUP_RECEIPTS/_capacity"
mkdir -p "$OUT"

# shellcheck source=lib/docker-safe.sh
. "$ROOT/scripts/lib/docker-safe.sh"
# shellcheck source=lib/job-marker.sh
. "$ROOT/scripts/lib/job-marker.sh"

MODE=sample JOB=capacity-sample PATTERN="*.jsonl"
if [ "${1:-}" = "--disk" ]; then MODE=disk JOB=capacity-disk PATTERN="disk-*.json"; fi

exec 9>"/tmp/bosun-$JOB.lock"
flock -n 9 || { echo "[$(date -u +%FT%TZ)] $JOB: previous run still going; skipping" >&2; exit 0; }

job_begin "$JOB"
trap _job_finish EXIT

if [ "$MODE" = disk ]; then
  node "$ROOT/scripts/capacity-sample.mjs" --disk
else
  node "$ROOT/scripts/capacity-sample.mjs"
fi
rc=$?

# Keep today + the previous 14 days (or 15 daily disk files).
export BOSUN_PRUNE_ROOT="$OUT"
prune_glob "$OUT" "$PATTERN" 15

exit $rc
