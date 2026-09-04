# Resolve the bosun-x data directory into $BOSUN_DATA.
# Source this AFTER $_repo_root is set (the scripts set it from BASH_SOURCE).
#
# Order:
#   1. $BOSUN_DATA / legacy $CONTROL_ROOM_DATA / $DATA_DIR, if it points at a real dir
#   2. a sibling of the app repo: ../bosun-x-data, then the legacy ../control-room-data
#   3. $HOME/bosun-x-data
# The app repo ships this generic default; an operator overrides it from the cron
# env file (e.g. `export BOSUN_DATA=/path/to/data`).

: "${BOSUN_DATA:=${CONTROL_ROOM_DATA:-${DATA_DIR:-}}}"

if [ -z "${BOSUN_DATA:-}" ] || [ ! -d "${BOSUN_DATA:-/nonexistent}" ]; then
  for _cand in \
    "$(dirname "$_repo_root")/bosun-x-data" \
    "$(dirname "$_repo_root")/control-room-data" \
    "$HOME/bosun-x-data"; do
    if [ -d "$_cand" ]; then BOSUN_DATA="$_cand"; break; fi
  done
fi
: "${BOSUN_DATA:=$HOME/bosun-x-data}"
