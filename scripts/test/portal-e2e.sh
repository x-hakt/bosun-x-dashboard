#!/usr/bin/env bash
# ============================================================================
# portal-e2e.sh — CGB-2.1
#
# Runs the built app in BOSUN_MODE=portal against a fixture data dir, mints a
# real Auth.js session cookie for a client and for an operator, and asserts the
# projection over HTTP:
#   - a client sees only projects shared with them; unshared ones 404
#   - a client's project detail carries no host/path/repo
#   - an operator sees every Gate-1 project in the portal
#   - operator routes (/servers) are unreachable in portal mode
# Requires a prior `npm run build`.
# ============================================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PORT=39997
SECRET="portal-e2e-secret-0000000000000000"
fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=1; }

FX=$(mktemp -d /tmp/portal-e2e.XXXXXX)
mkdir -p "$FX/projects" "$FX/planning/IDEA-1" "$FX/infra"
cat > "$FX/config.yml" <<YAML
operators: [boss@example.com]
YAML
cat > "$FX/clients.yml" <<YAML
portals:
  acme: { name: Acme Portal }
clients:
  - { slug: bob, name: Bob Client, portal: acme, emails: [bob@example.com] }
YAML
mkproj() { # slug portalsline sharedline
  mkdir -p "$FX/projects/$1"
  { echo "name: $1"; echo "slug: $1"; echo "stage: active"; echo "status: Live";
    echo "host: caspar"; echo "path: /opt/secret-$1"; [ -n "$2" ] && echo "$2"; [ -n "$3" ] && echo "$3"; } \
    > "$FX/projects/$1/project.yml"
  printf 'seq: 0\ntasks: []\n' > "$FX/projects/$1/tasks.yml"
}
mkproj shared    "portals: [acme]" "shared_with: [bob]"
mkproj gate1only "portals: [acme]" ""
mkproj private   "" ""
# CGB-8: on the shared project, one task whose thread is shared with bob and one
# that isn't. bob sees the first task's detail + a reply box; not the second's.
cat > "$FX/projects/shared/tasks.yml" <<YAML
seq: 2
tasks:
  - { id: task-shared, num: 1, title: Shared task, description: "secret-task-thread-shared", status: in_progress, shared_with: [bob], depends_on: [], created: "2026-01-01", updated: "2026-01-01" }
  - { id: task-private, num: 2, title: Private task, description: "secret-task-thread-private", status: todo, depends_on: [], created: "2026-01-01", updated: "2026-01-01" }
YAML
cat > "$FX/planning/IDEA-1/task.yml" <<YAML
id: IDEA-1
title: Shared idea
status: idea
type: idea
portals: [acme]
shared_with: [bob]
YAML
echo "a shared idea thread" > "$FX/planning/IDEA-1/NOTES.md"

pkill -9 -f "next-server|standalone/server.js" 2>/dev/null; sleep 1
DATA_DIR="$FX" BOSUN_MODE=portal BOSUN_PORTAL=acme AUTH_SECRET="$SECRET" \
  AUTH_URL="http://localhost:$PORT" GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x PORT=$PORT \
  node .next/standalone/server.js > /tmp/portal-e2e-server.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/api/health" && break; sleep 1; done

mint() { # email name  -> prints "authjs.session-token=<jwe>"
  AUTH_SECRET="$SECRET" node --input-type=module -e "
    import { encode } from '@auth/core/jwt';
    const t = await encode({ salt: 'authjs.session-token', secret: process.env.AUTH_SECRET,
      token: { email: process.argv[1], name: process.argv[2], sub: process.argv[1] } });
    process.stdout.write('authjs.session-token=' + t);
  " "$1" "$2"
}
CLIENT=$(mint bob@example.com "Bob Client")
OPERATOR=$(mint boss@example.com "Boss")

get() { curl -s -o /tmp/portal-body -w '%{http_code}' -H "Cookie: $1" "http://localhost:$PORT$2"; }

echo "== client (bob) =="
[ "$(get "$CLIENT" /c)" = 200 ] && ok "GET /c -> 200" || bad "GET /c"
grep -q '>shared<\|shared' /tmp/portal-body && ok "sees shared project" || bad "sees shared project"
grep -q 'gate1only' /tmp/portal-body && bad "leaked gate1only into the list" || ok "gate1only not listed"
grep -q '>private<' /tmp/portal-body && bad "leaked private into the list" || ok "private not listed"
[ "$(get "$CLIENT" /c/projects/shared)" = 200 ] && ok "shared detail -> 200" || bad "shared detail"
grep -qE 'secret-shared|caspar|/opt/' /tmp/portal-body && bad "host/path LEAKED in project detail" || ok "no host/path in detail"
grep -q 'secret-task-thread-shared' /tmp/portal-body && ok "CGB-8: shared task thread visible" || bad "shared task thread missing"
grep -q 'secret-task-thread-private' /tmp/portal-body && bad "CGB-8: unshared task thread LEAKED" || ok "unshared task thread withheld"
grep -q 'Approve / sign off' /tmp/portal-body && ok "CGB-8: reply/sign-off box on shared task" || bad "no reply box on shared task"
[ "$(get "$CLIENT" /c/projects/gate1only)" = 404 ] && ok "gate1only detail -> 404" || bad "gate1only detail not 404"
[ "$(get "$CLIENT" /c/projects/private)" = 404 ] && ok "private detail -> 404" || bad "private detail not 404"
[ "$(get "$CLIENT" /c/ideas/IDEA-1)" = 200 ] && ok "shared idea -> 200" || bad "shared idea"
[ "$(get "$CLIENT" /servers)" = 404 ] && ok "operator route /servers -> 404" || bad "/servers reachable in portal!"

echo "== operator (boss) =="
[ "$(get "$OPERATOR" /c)" = 200 ] && ok "operator GET /c -> 200" || bad "operator /c"
grep -q 'gate1only' /tmp/portal-body && ok "operator sees gate1only (Gate 2 auto-cleared)" || bad "operator missing gate1only"
grep -q '>private<' /tmp/portal-body && bad "operator sees non-portal project" || ok "operator does not see private (no Gate 1)"

echo "== stranger (not invited) =="
STRANGER=$(mint nobody@example.com "Nobody")
code=$(get "$STRANGER" /c)
{ [ "$code" = 307 ] || [ "$code" = 302 ] || [ "$code" = 403 ]; } && ok "uninvited email bounced ($code)" || bad "uninvited email got in ($code)"

kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null
rm -rf "$FX" /tmp/portal-body
echo
[ "$fail" = 0 ] && echo "PORTAL E2E OK" || { echo "PORTAL E2E FAILED"; tail -20 /tmp/portal-e2e-server.log; }
exit "$fail"
