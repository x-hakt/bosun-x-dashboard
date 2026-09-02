# job-marker.sh — CR-36 heartbeats. Source this; call `job_begin <name>` right
# after taking the run lock, and make sure `_job_finish` runs on exit (the caller
# owns the EXIT trap — `trap _job_finish EXIT`, or chain it with existing cleanup).
#
# Two files per job under $RECEIPTS_DIR/_jobs/:
#   <name>.running   present only while a run is in flight  ({job,started_at,pid,host})
#   <name>.json      the last completed run  ({job,started_at,finished_at,exit,ok,host})
#
# bosun-x reads both: a lingering .running past its grace = "started, never
# finished"; a .json whose finished_at is older than the job's cadence = "a run
# was expected and none came" (which an ever-ageing receipt alone never showed).

_JOB_NAME=""
_JOB_DIR="${BACKUP_RECEIPTS:-$HOME/backup-receipts}/_jobs"

job_begin() {
  _JOB_NAME=$1
  mkdir -p "$_JOB_DIR"
  jq -nc --arg job "$_JOB_NAME" --arg started "$(date -u +%FT%TZ)" \
     --arg host "$(hostname)" --argjson pid "$$" \
     '{job:$job, started_at:$started, host:$host, pid:$pid}' \
     > "$_JOB_DIR/$_JOB_NAME.running" 2>/dev/null || true
}

_job_finish() {
  local rc=$?
  [ -n "$_JOB_NAME" ] || return
  local started
  started=$(jq -r '.started_at // empty' "$_JOB_DIR/$_JOB_NAME.running" 2>/dev/null)
  jq -nc --arg job "$_JOB_NAME" --arg started "$started" \
     --arg finished "$(date -u +%FT%TZ)" --arg host "$(hostname)" --argjson exit "$rc" \
     '{job:$job, started_at:$started, finished_at:$finished, host:$host, exit:$exit, ok:($exit==0)}' \
     > "$_JOB_DIR/$_JOB_NAME.json" 2>/dev/null || true
  rm -f "$_JOB_DIR/$_JOB_NAME.running"
}

# Snapshot the host's scheduled jobs so bosun-x (which runs in a container and
# can't read the host crontab) can list what is and isn't monitored. Best effort.
job_snapshot_schedule() {
  mkdir -p "$_JOB_DIR"
  python3 - <<'PY' > "$_JOB_DIR/schedule.json" 2>/dev/null || true
import subprocess, json, datetime
out = {"captured_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "cron": [], "timers": []}
try:
    cron = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=10).stdout
    for ln in cron.splitlines():
        s = ln.strip()
        if s and not s.startswith("#"):
            out["cron"].append(s)
except Exception:
    pass
try:
    raw = subprocess.run(["systemctl", "list-timers", "--all", "--no-pager", "--output=json"],
                         capture_output=True, text=True, timeout=10).stdout
    for row in json.loads(raw or "[]"):
        out["timers"].append({"unit": row.get("unit"), "next": row.get("next"), "activates": row.get("activates")})
except Exception:
    pass
print(json.dumps(out))
PY
}
