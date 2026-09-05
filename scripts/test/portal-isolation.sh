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
import { passesGates, canSeeSharedTask } from '$tmp/gates.js';
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
  // canSeeSharedTask (CGB-8): project must pass both gates AND the task's own shared_with must list the client
  ['task: project not shared with client -> closed', canSeeSharedTask(['acme'], ['eve'], ['bob'], bob, 'acme'), false],
  ['task: project shared, task not -> closed',       canSeeSharedTask(['acme'], ['bob'], undefined, bob, 'acme'), false],
  ['task: project + task shared -> open',            canSeeSharedTask(['acme'], ['bob'], ['bob'], bob, 'acme'), true],
  ['task: operator sees every task in the portal',   canSeeSharedTask(['acme'], undefined, undefined, op, 'acme'), true],
  // CGB-14: a project-level task_sharing_default of "all" — no per-task override
  ['task: no override, default all -> open',     canSeeSharedTask(['acme'], ['bob'], undefined, bob, 'acme', 'all'), true],
  ['task: no override, default none -> closed',  canSeeSharedTask(['acme'], ['bob'], undefined, bob, 'acme', 'none'), false],
  ['task: [] override beats default all -> closed', canSeeSharedTask(['acme'], ['bob'], [], bob, 'acme', 'all'), false],
  ['task: list override beats default none -> open', canSeeSharedTask(['acme'], ['bob'], ['bob'], bob, 'acme', 'none'), true],
  ['task: default all still needs project Gate 2', canSeeSharedTask(['acme'], ['bob'], undefined, eve, 'acme', 'all'), false],
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
const signoffDoc = 'brief\n\n' + noteTurnHeader('Bob Client', '2026-01-02', 'client sign-off') + '\n\nok';
const messageDoc = 'brief\n\n' + noteTurnHeader('Bob Client', '2026-01-02', 'client message') + '\n\nhey there';
const agentDoc = 'brief\n\n' + noteTurnHeader('Claude', '2026-01-02', 'shipped') + '\n\ndone';
let bad = 0;
const clientTurn = parseNoteThread(clientDoc).find(t => t.role === 'client');
if (clientTurn && clientTurn.author === 'Bob Client') console.log('  ok   client reply -> role:client, author kept');
else { console.log('  FAIL client reply not detected: ' + JSON.stringify(clientTurn)); bad = 1; }
if (parseNoteThread(signoffDoc).some(t => t.role === 'client')) console.log('  ok   client sign-off -> role:client');
else { console.log('  FAIL client sign-off not detected'); bad = 1; }
if (parseNoteThread(messageDoc).some(t => t.role === 'client')) console.log('  ok   client message -> role:client (CGB-10)');
else { console.log('  FAIL client message not detected'); bad = 1; }
if (countClientReplies(clientDoc) === 1 && countClientReplies(signoffDoc) === 1 && countClientReplies(messageDoc) === 1) console.log('  ok   countClientReplies counts reply + sign-off + message');
else { console.log('  FAIL countClientReplies'); bad = 1; }
if (countClientReplies(agentDoc) === 0) console.log('  ok   an agent turn is not counted');
else { console.log('  FAIL agent turn counted as a client reply'); bad = 1; }
process.exit(bad);
" || bad "client-reply detection"
rm -rf "$tmp2"

echo "== 5. portal registry edits (CGB-7) =="
# The Settings → Client portals editor rewrites clients.yml from this pure model.
# Prove it round-trips and refuses malformed input / unsafe deletes.
# Compiled under the repo (not /tmp) so the emitted data/schema.js can resolve zod;
# the @/ path alias is rewritten to a relative import by hand.
tmp3=scripts/test/.tmp-portal-admin
rm -rf "$tmp3"
npx tsc src/lib/portal-admin-edit.ts src/lib/data/schema.ts \
  --rootDir src/lib --outDir "$tmp3" --module nodenext --moduleResolution nodenext \
  --target es2022 --skipLibCheck --esModuleInterop >/dev/null 2>&1
sed -i 's#@/lib/data/schema#./data/schema.js#' "$tmp3/portal-admin-edit.js"
node --input-type=module -e "
import * as E from './$tmp3/portal-admin-edit.js';
let bad = 0;
const check = (name, fn, wantThrow) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (threw === wantThrow) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name); bad = 1; }
};
let doc = E.emptyRegistry();
doc = E.upsertPortal(doc, 'acme', { name: 'Acme', theme: { accent: '#fff', tagline: '' } });
doc = E.upsertClient(doc, 'bob', { name: 'Bob', portal: 'acme', emails: ['BOB@x.io', 'bob@x.io'] });
check('valid doc passes schema', () => E.assertValidRegistry(doc), false);
const ser = E.serialiseRegistry(doc);
if (ser.portals.acme.theme.accent === '#fff' && !('tagline' in ser.portals.acme.theme)) console.log('  ok   empty theme values dropped');
else { console.log('  FAIL empty theme values not dropped'); bad = 1; }
if (ser.clients[0].emails.length === 1 && ser.clients[0].emails[0] === 'bob@x.io') console.log('  ok   emails lower-cased + de-duped');
else { console.log('  FAIL email normalisation'); bad = 1; }
check('bad slug rejected', () => E.upsertClient(doc, 'Bad Slug', { name: 'x', portal: 'acme', emails: ['a@b.co'] }), true);
check('bad email rejected', () => E.upsertClient(doc, 'eve', { name: 'Eve', portal: 'acme', emails: ['not-an-email'] }), true);
check('unknown portal rejected', () => E.upsertClient(doc, 'eve', { name: 'Eve', portal: 'ghost', emails: ['a@b.co'] }), true);
check('delete portal with a client rejected', () => E.removePortal(doc, 'acme'), true);
check('delete portal after client removed ok', () => E.removePortal(E.removeClient(doc, 'bob'), 'acme'), false);
process.exit(bad);
" || bad "portal registry edits"
rm -rf scripts/test/.tmp-portal-admin

echo "== 6. portal seen-store (CGB-9) =="
# Per-client visit timestamps for the digest — round-trip + slug guard.
tmp4=scripts/test/.tmp-seen
seendata=$(mktemp -d)
rm -rf "$tmp4"
npx tsc src/lib/portal-seen-store.ts src/lib/data/paths.ts \
  --rootDir src/lib --outDir "$tmp4" --module nodenext --moduleResolution nodenext \
  --target es2022 --skipLibCheck --esModuleInterop >/dev/null 2>&1
sed -i 's#@/lib/data/paths#./data/paths.js#' "$tmp4/portal-seen-store.js"
DATA_DIR="$seendata" node --input-type=module -e "
import * as S from './$tmp4/portal-seen-store.js';
let bad = 0;
if (await S.readPortalSeenAt('bob') === null) console.log('  ok   unseen client -> null');
else { console.log('  FAIL first visit not null'); bad = 1; }
await S.writePortalSeenAt('bob', '2026-09-04T10:00:00.000Z');
if (await S.readPortalSeenAt('bob') === '2026-09-04T10:00:00.000Z') console.log('  ok   write then read round-trips');
else { console.log('  FAIL round-trip'); bad = 1; }
let threw = false;
try { await S.writePortalSeenAt('../etc', 'x'); } catch { threw = true; }
if (threw) console.log('  ok   path-traversal slug rejected');
else { console.log('  FAIL bad slug not rejected'); bad = 1; }
if (await S.readPortalSeenAt('../etc') === null) console.log('  ok   bad slug reads null');
else { console.log('  FAIL bad slug read'); bad = 1; }
process.exit(bad);
" || bad "portal seen-store"
rm -rf "$tmp4" "$seendata"

echo
[ "$fail" = 0 ] && echo "PORTAL ISOLATION OK" || echo "PORTAL ISOLATION FAILED"
exit "$fail"
