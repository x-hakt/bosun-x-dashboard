# Client portal

A read-mostly, per-client view of your bosun-x data. A client signs in and sees
only the projects, idea threads and notes you've shared with them, and can reply
into shared idea threads. The operator dashboard stays single-tenant — the portal
is a **separate deployment of the same image** in `BOSUN_MODE=portal`.

## How isolation works

Two gates, both default-closed, checked in `src/lib/portal/gates.ts`:

| Gate | Field | Means |
|---|---|---|
| 1 | `portals: [<portal-slug>]` | "this is *that business's* work" — shows the item in that portal |
| 2 | `shared_with: [<client-slug>]` | which clients in that portal may see it |

An operator viewer clears Gate 2 automatically (sees every Gate-1 item in the
portal, for preview). Everything the portal renders goes through
`src/lib/portal/projection.ts` — a field-by-field whitelist, so `host`, `path`,
`repo`, handoff logs, backups, etc. can't leak even if a new operator-only field
is added upstream. An eslint fence stops any other portal file importing an
operator data module directly. `scripts/test/portal-isolation.sh` and
`scripts/test/portal-e2e.sh` prove it.

## Setup

### 1. `<DATA_DIR>/clients.yml`

```yaml
portals:
  acme:                     # the portal slug — used in BOSUN_PORTAL and `portals:`
    name: Acme Studio
    url: https://portal.acme.example
    theme:                  # optional — a few CSS values the portal layout injects
      brand_name: Acme Studio
      accent: "#5b8def"
      paper: "#0f1420"
      ink: "#e6ecf5"

clients:
  - slug: bob
    name: Bob Client
    portal: acme
    emails: [bob@bob-co.example]   # the address(es) Bob signs in with
```

### 2. Share something

On the operator dashboard, open a project (or a planning idea, or a note) → the
**Client portal** control → tick the portal, then tick the clients. Or edit the
YAML: `portals: [acme]` + `shared_with: [bob]`.

Task-level detail: a task doesn't appear in the portal **at all** — not even
its title — unless the task itself also carries `shared_with: [bob]` (in
`tasks.yml`). Sharing a project never implies sharing its tasks; day-to-day
bug/fault tasks stay invisible by default, and only the ones you deliberately
flag for a client show up, the same way idea threads and notes do.

Client-facing prose: an optional `projects/<slug>/PORTAL.md` renders at the top
of the portal project page.

Links and tech tags: `tags` on a shared project always show (low-sensitivity
tech-stack labels). `links` need their own opt-in — each link has a `portal:
true/false` flag (edit from the project's Links card, or by hand); only
flagged links reach the portal, so an admin panel or a monitoring URL on the
same project stays operator-only by default.

### Client interaction

A signed-in client can reply into any shared **idea** thread and any shared
**task** thread (a task's thread shows only when its own `shared_with` lists the
client), and can post a one-click **Approve / sign off**.

When they do, the operator dashboard flags it: an amber card in the thread, a
"N new" badge on the Planning list / task list, a "Mark reviewed" notice, and a
**Client replies** tile on the overview. "Mark reviewed" pins a
`client_replies_seen` count on the idea's `task.yml` / the task in `tasks.yml`;
the nudge returns when the next reply lands.

### Direct messages

Separate from any project/idea/task thread, every client also gets one
always-on conversation with you: **Messages** in the portal nav, and a
**Messages** page + sidebar entry (with an unread badge) on your side. Stored
as `<DATA_DIR>/portal-messages/<client-slug>/{NOTES.md,meta.yml}` — real
content, tracked in git like everything else. No sign-off button there; it's
just a chat.

### "Since your last visit"

The portal home shows each returning client a digest of the shared projects,
ideas and notes whose `updated` stamp moved since their previous visit, plus a
line if a new message (see above) arrived from you. Visit
timestamps are one small JSON file per client under
`<DATA_DIR>/.portal-state/` (gitignored; written by the portal, never operator
content). First visit shows nothing; there's no email — it's an in-portal nudge.

### 3. Deploy

Copy `deploy/docker-compose.portal.example.yml`, set `BOSUN_PORTAL`, `AUTH_URL`
(the portal's own origin), and a sign-in provider + `AUTH_SECRET` in `.env`.
Point it at the same data dir as the operator dashboard. Front it with your
reverse proxy on the portal domain.

A sign-in provider is **required** in portal mode — `clients.yml` is the
allowlist, so an email that isn't invited is refused. Register the portal's
`/api/auth/callback/<provider>` URL with that provider.

If the portal domain is behind Cloudflare (or another proxy) and your reverse
proxy gets its TLS cert via ACME **TLS-ALPN-01**, the challenge can't complete
through the proxy — issue the cert with the record un-proxied (DNS-only) first,
or use DNS-01 / a provider origin certificate.
