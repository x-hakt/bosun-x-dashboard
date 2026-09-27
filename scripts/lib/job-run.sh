#!/usr/bin/env bash
# job-run.sh — BXD-94: give any cron line a heartbeat and a run history without touching
# the job itself.
#
#   job-run.sh <name> [--label "Readable name"] [--family <family>] [--every 5m|2h|1d|7d] -- <command...>
#
# Writes the same _jobs/<name>.running / <name>.json markers as scripts/lib/job-marker.sh,
# appends each run to _jobs/runs.jsonl, and exits with the command's own exit code. The
# command's output is left alone (the crontab's own redirect still applies); nothing it
# prints is captured. Families pick who runs the errand in the port: lamplighter (certs),
# courier (syncs, imports), warehouse (backups), watchman (health checks), sweeper
# (cleanups), clerk (records, stats, housekeeping).
set -u
[ $# -ge 1 ] || { echo "usage: job-run.sh <name> [--label L] [--family F] [--every E] -- command..." >&2; exit 64; }
name=$1; shift
case "$name" in *[!A-Za-z0-9._-]*|"") echo "job-run.sh: bad job name: $name" >&2; exit 64 ;; esac
_JOB_LABEL=""; _JOB_FAMILY=""; _JOB_EVERY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) _JOB_LABEL=${2:-}; shift 2 ;;
    --family) _JOB_FAMILY=${2:-}; shift 2 ;;
    --every) _JOB_EVERY=${2:-}; shift 2 ;;
    --) shift; break ;;
    *) echo "job-run.sh: unknown option $1 (the command goes after --)" >&2; exit 64 ;;
  esac
done
[ $# -gt 0 ] || { echo "job-run.sh: no command after --" >&2; exit 64; }
# shellcheck source=job-marker.sh
. "$(dirname "${BASH_SOURCE[0]}")/job-marker.sh"
job_begin "$name"
"$@"
rc=$?
_job_finish "$rc"
exit "$rc"
