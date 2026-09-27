#!/usr/bin/env bash
# container-events.sh — BXD-105: the port's record of container starts and crashes.
#
#   container-events.sh        (cron, every couple of minutes; wrap it with lib/job-run.sh)
#
# Docker's own event history is too short to poll (healthcheck execs push starts out of it
# within minutes), so this compares container state between runs instead: a new StartedAt is
# a start (a deploy, restart or recreate), and a higher RestartCount is a crash that Docker's
# restart policy picked back up. Appends one compact line per change to
# $BACKUP_RECEIPTS/_events/containers.jsonl ({at, container, action, exit}), trimmed to the
# newest 20000 lines once it passes 3 MB. Names, times and exit codes only. The dashboard
# maps names to projects through each project.yml's `containers`.
set -u
dir="${BACKUP_RECEIPTS:-$HOME/backup-receipts}/_events"
mkdir -p "$dir"
out="$dir/containers.jsonl"
state="$dir/containers.state"
(
  flock -w 30 9 || exit 1
  ids=$(docker ps -aq) || exit 1
  now=""
  [ -n "$ids" ] && now=$(docker inspect $ids --format '{{.Name}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.State.FinishedAt}}|{{.State.ExitCode}}' | sed 's|^/||' | sort) || exit 1
  if [ -f "$state" ]; then
    printf '%s\n' "$now" | python3 -c 'import json, sys
prev = {}
for line in open(sys.argv[1]):
    p = line.rstrip("\n").split("|")
    if len(p) >= 3: prev[p[0]] = p
with open(sys.argv[2], "a") as out:
    for line in sys.stdin:
        p = line.rstrip("\n").split("|")
        if len(p) < 5: continue
        name, started, restarts, finished, code = p[:5]
        old = prev.get(name)
        valid = not started.startswith("0001")
        if old and old[2].isdigit() and restarts.isdigit() and int(restarts) > int(old[2]):
            out.write(json.dumps({"at": finished[:19] + "Z", "container": name, "action": "crash", "exit": int(code) if code.lstrip("-").isdigit() else None}) + "\n")
        if valid and (not old or old[1] != started):
            out.write(json.dumps({"at": started[:19] + "Z", "container": name, "action": "start", "exit": None}) + "\n")
' "$state" "$out" || exit 1
  fi
  printf '%s\n' "$now" > "$state.tmp" && mv -f "$state.tmp" "$state"
  if [ "$(stat -c %s "$out" 2>/dev/null || echo 0)" -gt 3145728 ]; then
    tail -n 20000 "$out" > "$out.tmp" && mv -f "$out.tmp" "$out"
  fi
) 9>"$dir/containers.lock"
