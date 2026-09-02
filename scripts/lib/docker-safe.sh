# docker-safe.sh — the ONLY sanctioned way for a bosun-x fleet script to start or
# remove a container, or to prune files. Source it near the top of every fleet-*.sh.
#
# After the 2026-09-02 playtopia incident (a restore-test run removed live DB
# containers) the rule is absolute:
#
#   * A bosun-x script may start ONLY throwaway containers — always `--rm`,
#     `--network none`, no `--name`, tagged with a per-run label.
#   * It may remove ONLY containers carrying THIS run's label, and every removal
#     is re-checked with `docker inspect` first.
#   * There is deliberately NO helper here for `docker stop|rm|kill|prune`,
#     `docker volume rm`, `docker compose down`, or `pg_restore`/`psql` against
#     anything but a throwaway. A script that thinks it needs one has to add it
#     by hand and get it reviewed.
#   * `guard_path` / `prune_glob` are the only sanctioned ways to delete files.

# Unique to this process. pid + epoch + a random word — cannot collide, cannot be
# empty (bash always has $$ and $RANDOM).
BOSUN_RUN_ID="${BOSUN_RUN_ID:-$$-$(date +%s)-${RANDOM}${RANDOM}}"
BOSUN_THROWAWAY_LABEL="bosun.throwaway"

# throwaway_run_d <docker-run args...> — detached. Forces -d --rm --network none
# --label. Echoes the container id. Use for a container you then `docker exec` into.
throwaway_run_d() {
  docker run -d --rm --network none --label "$BOSUN_THROWAWAY_LABEL=$BOSUN_RUN_ID" "$@"
}

# throwaway_run_stream <docker-run args...> — foreground, stdout streams to the
# caller (for `... | zstd | ...` producers). Same forced flags, minus -d.
throwaway_run_stream() {
  docker run --rm --network none --label "$BOSUN_THROWAWAY_LABEL=$BOSUN_RUN_ID" "$@"
}

# _bosun_is_ours <cid> — true only if the container carries this run's exact label.
_bosun_is_ours() {
  [ -n "${1:-}" ] || return 1
  [ "$(docker inspect -f "{{index .Config.Labels \"$BOSUN_THROWAWAY_LABEL\"}}" "$1" 2>/dev/null || true)" = "$BOSUN_RUN_ID" ]
}

# throwaway_rm <cid> — remove one container, ONLY if it is ours.
throwaway_rm() {
  local id=${1:-}
  [ -n "$id" ] || return 0
  if _bosun_is_ours "$id"; then
    docker rm -f "$id" >/dev/null 2>&1 || true
  else
    echo "docker-safe: REFUSING to remove '$id' — not one of ours" >&2
    return 1
  fi
}

# throwaway_rm_all — sweep every container with THIS run's label (each re-checked).
# Safe to call from an EXIT trap.
throwaway_rm_all() {
  local id
  for id in $(docker ps -aq --filter "label=$BOSUN_THROWAWAY_LABEL=$BOSUN_RUN_ID" 2>/dev/null || true); do
    _bosun_is_ours "$id" && docker rm -f "$id" >/dev/null 2>&1 || true
  done
}

# guard_path <path> <required-prefix> — exit 1 unless <path> is non-empty,
# absolute, has no '..', and sits under <required-prefix>. Call before any rm.
guard_path() {
  local p=${1:-} prefix=${2:-}
  [ -n "$prefix" ] || { echo "docker-safe: guard_path needs a prefix" >&2; exit 1; }
  case "$p" in
    "" | "/" ) echo "docker-safe: unsafe path '$p'" >&2; exit 1 ;;
    *".."* )   echo "docker-safe: path contains '..' — '$p'" >&2; exit 1 ;;
  esac
  case "$p" in
    "$prefix" | "$prefix"/* ) : ;;
    * ) echo "docker-safe: '$p' is not under '$prefix'" >&2; exit 1 ;;
  esac
}

# prune_glob <dir> <name-pattern> <keep> — keep the newest <keep> files matching
# <dir>/<name-pattern> (one level, files only), delete the rest. Requires
# BOSUN_PRUNE_ROOT to be exported; <dir> must be under it. The only sanctioned
# way a fleet script deletes old archives.
prune_glob() {
  local dir=${1:-} pat=${2:-} keep=${3:-14}
  [ -n "${BOSUN_PRUNE_ROOT:-}" ] || { echo "docker-safe: BOSUN_PRUNE_ROOT unset" >&2; exit 1; }
  [ -n "$pat" ] || { echo "docker-safe: prune_glob needs a pattern" >&2; exit 1; }
  guard_path "$dir" "$BOSUN_PRUNE_ROOT"
  [ -d "$dir" ] || return 0
  local n=0 f
  while IFS= read -r f; do
    n=$((n + 1))
    [ "$n" -gt "$keep" ] && rm -f -- "$f"
  done < <(find "$dir" -maxdepth 1 -type f -name "$pat" -printf '%T@\t%p\n' 2>/dev/null | sort -rn | cut -f2-)
}
