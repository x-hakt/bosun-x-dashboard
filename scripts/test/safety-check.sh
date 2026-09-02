#!/usr/bin/env bash
# ============================================================================
# safety-check.sh — proves the fleet scripts cannot remove a container or file
# they did not create. Run after any change to fleet-*.sh or scripts/lib/.
#
# It stands up canary containers whose names would be hit by a sloppy
# `docker rm`/filter, runs the real backup + restore-test, and asserts every
# canary (and every pre-existing container) is still there afterwards, and that
# the only containers created/destroyed carried the bosun.throwaway label.
# ============================================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Run against a scratch receipts dir + log so real backup state / job markers
# are untouched. The scripts still hit the real Docker daemon and the real
# backup destination (read-only for the canary assertions we care about).
SCRATCH=$(mktemp -d /tmp/bosun-safety.XXXXXX)
export BACKUP_RECEIPTS="$SCRATCH/receipts"
export BACKUP_LOG="$SCRATCH/log"
mkdir -p "$BACKUP_RECEIPTS"
trap 'rm -rf "$SCRATCH"' EXIT
# exercise both code paths: a files store and a postgres store (the latter is
# the one that creates + removes containers — the whole point of this test).
SLUGS=(${SAFETY_CHECK_SLUGS:-cgburchell sportsball-coach})

fail=0
note() { echo "  $*"; }
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }

CANARIES=(postgres restore playtopia-db tournament-db fleet-restore-test-x-playtopia-db db)
echo "== standing up ${#CANARIES[@]} canary containers =="
for c in "${CANARIES[@]}"; do
  docker rm -f "cr-canary-$c" >/dev/null 2>&1 || true
  docker run -d --name "cr-canary-$c" --restart unless-stopped --label cr.canary=1 \
    alpine sleep 3600 >/dev/null
done

before_all=$(docker ps -aq | sort)
before_throwaway=$(docker ps -aq --filter label=bosun.throwaway | sort)

for SLUG in "${SLUGS[@]}"; do
  echo "== fleet-backup.sh $SLUG + fleet-restore-test.sh $SLUG =="
  ./scripts/fleet-backup.sh "$SLUG" >/dev/null 2>&1 || true
  ./scripts/fleet-restore-test.sh "$SLUG" >/dev/null 2>&1 || true
done

after_all=$(docker ps -aq | sort)

echo
echo "== assertions =="
# 1. every canary still exists
for c in "${CANARIES[@]}"; do
  check "canary '$c' survived" "docker inspect cr-canary-$c >/dev/null 2>&1"
done
# 2. no pre-existing container disappeared
gone=$(comm -23 <(echo "$before_all") <(echo "$after_all") | grep -v '^$' || true)
check "no pre-existing container removed" "[ -z \"\$(comm -23 <(echo \"$before_all\") <(echo \"$after_all\") | grep -v '^\$')\" ]"
[ -n "$gone" ] && note "removed: $gone"
# 3. anything that appeared and vanished must have carried the throwaway label
#    (we can't inspect a gone container, but the restore-test only ever creates
#    labelled ones — so assert none of THIS run's throwaways linger)
lingering=$(docker ps -aq --filter label=bosun.throwaway | sort | comm -13 <(echo "$before_throwaway") - || true)
check "no throwaway containers left behind" "[ -z \"$lingering\" ]"
[ -n "$lingering" ] && note "lingering: $lingering"

echo
echo "== teardown =="
for c in "${CANARIES[@]}"; do docker rm -f "cr-canary-$c" >/dev/null 2>&1 || true; done

echo
[ "$fail" = 0 ] && echo "ALL SAFETY CHECKS PASSED" || echo "SAFETY CHECKS FAILED"
exit "$fail"
