# Sign-in

The dashboard has no user database. Sign-in is an OAuth / OIDC round-trip to a
provider you choose, and access is gated by an **email allowlist**.

Set the environment variables for whichever provider(s) you want — more than one
is fine, the login page shows a button for each. With none set, the dashboard is
**open to anyone who can reach it** (acceptable on a home LAN behind a firewall,
not on the public internet).

Every deployment also needs:

```
AUTH_SECRET=<32+ random bytes>     # openssl rand -base64 33
AUTH_URL=https://your-dashboard.example.com
```

## The allowlist

Once any provider is configured, only allow-listed emails can sign in:

- `operators:` in `config.yml` (edit it on the Settings page), one email per line, **or**
- the `ALLOWED_EMAIL` environment variable (a single address — wins over `operators`).

An empty allowlist with a provider configured means **nobody gets in** — that's a
misconfiguration, not "open". Providers that can hide a user's email (GitHub with
a private email) must have a verified email visible for the match to work.

## The callback URL

Every provider needs one **redirect / callback URL** registered with it:

```
https://<your AUTH_URL host>/api/auth/callback/<provider id>
```

The provider ids are `google`, `github`, `oidc`.

---

## Google

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized redirect URIs:** `https://your-dashboard.example.com/api/auth/callback/google`
3. **Authorized JavaScript origins:** `https://your-dashboard.example.com`

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   (or an org's Developer settings for an org-scoped app).
2. **Homepage URL:** `https://your-dashboard.example.com`
3. **Authorization callback URL:** `https://your-dashboard.example.com/api/auth/callback/github`

```
GITHUB_CLIENT_ID=Iv1....
GITHUB_CLIENT_SECRET=...
```

The GitHub provider requests the `read:user user:email` scope, so the primary
verified email is available for the allowlist.

## Generic OIDC — Authentik, Keycloak, Auth0, Zitadel, Okta, Pocket ID, Kanidm, …

Any provider that publishes an OpenID Connect discovery document
(`<issuer>/.well-known/openid-configuration`) works through one config.

1. In your identity provider, create an **OAuth2/OIDC application / client**:
   - type: confidential (has a client secret), **Authorization Code** flow
   - redirect URI: `https://your-dashboard.example.com/api/auth/callback/oidc`
   - scopes: `openid profile email`
2. Copy the **issuer URL**, **client id**, **client secret**.

```
OIDC_ISSUER=https://id.example.com/application/o/bosun-x/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_NAME="Company SSO"     # optional — the button label, defaults to "SSO"
```

Provider-specific issuer shapes:

| provider  | issuer |
| --- | --- |
| Authentik | `https://authentik.example.com/application/o/<app-slug>/` |
| Keycloak  | `https://kc.example.com/realms/<realm>` |
| Auth0     | `https://<tenant>.<region>.auth0.com/` |
| Zitadel   | `https://<instance>.zitadel.cloud` |
| Okta      | `https://<org>.okta.com/oauth2/default` |
| Pocket ID | `https://pocket-id.example.com` |

## No sign-in (LAN only)

Set none of the above. The proxy lets every request straight through. Only do
this when the dashboard is not reachable from the internet.
