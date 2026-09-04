#!/usr/bin/env bash
# ============================================================================
# portal-isolation.sh — CGB-2.1
#
# Proves the client portal cannot leak operator data:
#   1. the eslint import fence holds (portal code reaches data only via
#      projection.ts / auth.ts)
#   2. no portal file bypasses it with a direct @/lib/{data,actions,infra,checks}
#      import (belt-and-braces grep)
#   3. the two share gates behave (passesGates truth table)
# Run after any change under src/lib/portal or src/app/(portal).
# ============================================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; fail=1; }

echo "== 1. eslint import fence =="
if npm run --silent lint 2>&1 | grep -qE "no-restricted-imports"; then
  bad "eslint reports a restricted import in portal code"
else
  ok "eslint clean of restricted imports"
fi

echo "== 2. no direct operator-module import in portal code =="
# every file under the fenced dirs EXCEPT the two audited boundary files
# the three audited boundary files may reach operator modules; nothing else may
hits=$(grep -rlE "from ['\"]@/lib/(data|actions|infra|checks)" \
        src/app/'(portal)' src/lib/portal 2>/dev/null \
        | grep -vE "src/lib/portal/(projection|auth|reply)\.ts$" || true)
if [ -n "$hits" ]; then
  bad "these portal files import an operator module directly:"
  echo "$hits" | sed 's/^/       /'
else
  ok "only projection.ts / auth.ts / reply.ts touch operator modules"
fi

echo "== 3. share-gate truth table =="
tmp=$(mktemp -d)
npx tsc src/lib/portal/gates.ts --outDir "$tmp" --module nodenext --moduleResolution nodenext --target es2022 >/dev/null 2>&1
node --input-type=module -e "
import { passesGates } from '$tmp/gates.js';
const op = { kind: 'operator' };
const bob = { kind: 'client', slug: 'bob' };
const eve = { kind: 'client', slug: 'eve' };
const cases = [
  ['no portals -> closed',        passesGates(undefined, ['bob'], bob, 'acme'),        false],
  ['wrong portal -> closed',      passesGates(['other'], ['bob'], bob, 'acme'),        false],
  ['gate1 only, client -> closed',passesGates(['acme'], undefined, bob, 'acme'),       false],
  ['gate1 only, operator -> open',passesGates(['acme'], undefined, op, 'acme'),        true],
  ['both gates, right client',    passesGates(['acme'], ['bob'], bob, 'acme'),         true],
  ['both gates, wrong client',    passesGates(['acme'], ['bob'], eve, 'acme'),         false],
  ['empty portalSlug -> closed',  passesGates(['acme'], ['bob'], op, ''),              false],
];
let bad = 0;
for (const [name, got, want] of cases) {
  if (got === want) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + ' (got ' + got + ', want ' + want + ')'); bad = 1; }
}
process.exit(bad);
" || bad "gate truth table"
[ "$fail" = 0 ] && ok "share gates behave"
rm -rf "$tmp"

echo "== 4. client-reply detection (CGB-6) =="
# reply.ts stamps a "client reply" labelled turn; the operator UI keys its nudge
# off parseNoteThread marking that turn role:"client". Lock the contract.
tmp2=$(mktemp -d)
npx tsc src/lib/notes-thread.ts --outDir "$tmp2" --module nodenext --moduleResolution nodenext --target es2022 >/dev/null 2>&1
node --input-type=module -e "
import { parseNoteThread, countClientReplies, noteTurnHeader } from '$tmp2/notes-thread.js';
const clientDoc = 'brief\n\n' + noteTurnHeader('Bob Client', '2026-01-02', 'client reply') + '\n\nhello';
const agentDoc = 'brief\n\n' + noteTurnHeader('Claude', '2026-01-02', 'shipped') + '\n\ndone';
let bad = 0;
const clientTurn = parseNoteThread(clientDoc).find(t => t.role === 'client');
if (clientTurn && clientTurn.author === 'Bob Client') console.log('  ok   client reply -> role:client, author kept');
else { console.log('  FAIL client reply not detected: ' + JSON.stringify(clientTurn)); bad = 1; }
if (countClientReplies(clientDoc) === 1) console.log('  ok   countClientReplies = 1');
else { console.log('  FAIL countClientReplies != 1'); bad = 1; }
if (countClientReplies(agentDoc) === 0) console.log('  ok   an agent turn is not counted');
else { console.log('  FAIL agent turn counted as a client reply'); bad = 1; }
process.exit(bad);
" || bad "client-reply detection"
rm -rf "$tmp2"

echo
[ "$fail" = 0 ] && echo "PORTAL ISOLATION OK" || echo "PORTAL ISOLATION FAILED"
exit "$fail"
