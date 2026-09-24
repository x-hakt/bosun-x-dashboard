#!/usr/bin/env bash
# ============================================================================
# capacity-sample.sh — BXD-62. Cron wrapper for scripts/capacity-sample.mjs:
# one run at a time, a job heartbeat bosun-x shows on /backups (job
# "capacity-sample"), and 14 days of retention for $BACKUP_RECEIPTS/_capacity.
#
#   */5 * * * * . ~/unified-services/.backup-env; ~/unified-services/bosun-x-dashboard/scripts/capacity-sample.sh >> ~/unified-services/logs/capacity-sample.log 2>&1
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

exec 9>"/tmp/bosun-capacity-sample.lock"
flock -n 9 || { echo "[$(date -u +%FT%TZ)] capacity-sample: previous run still going; skipping" >&2; exit 0; }

job_begin capacity-sample
trap _job_finish EXIT

node "$ROOT/scripts/capacity-sample.mjs"
rc=$?

# Keep today + the previous 14 days.
export BOSUN_PRUNE_ROOT="$OUT"
prune_glob "$OUT" "*.jsonl" 15

exit $rc
