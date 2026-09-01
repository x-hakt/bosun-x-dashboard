# Configuration

Two layers: **`<DATA_DIR>/config.yml`** for instance settings (editable in the UI on
the Settings page), and **environment variables** for secrets and deploy-time wiring.
Everything has a default — the dashboard runs with no `config.yml` and only `DATA_DIR`
set.

## config.yml

| key | default | meaning |
| --- | --- | --- |
| `timezone` | system zone | IANA name for every timestamp the dashboard writes |
| `operators` | *(empty)* | emails allowed to sign in (see [auth](auth.md)); `ALLOWED_EMAIL` env overrides |
| `local_host` | the one host in `hosts.yml` with no `ssh_alias` | which host id *this* machine is |
| `project_roots` | `$HOME` | dirs to scan for `docker-compose*.yml`; a trailing `/*` scans one level in |
| `shared_compose_project` | *(none)* | name of a single big compose project whose sub-apps should be listed per folder |
| `remote_project_path` | `/opt` | where projects live on a remote host when `project.yml` gives no `path` |
| `ssh_config` | `~/.ssh/config` | ssh config holding the least-privilege discovery keys ([discovery](discovery.md)) |
| `backup_receipts` | `<DATA_DIR>/../backup-receipts` | where the backup agent drops result files; `BACKUP_RECEIPTS` env overrides |

`bosun setup` (from the [`bosun-x`](https://github.com/x-hakt/bosun-x) CLI) walks these
interactively and scaffolds the data dir.

## Environment variables

| var | meaning |
| --- | --- |
| `DATA_DIR` | the data directory (bind-mounted in the container). Required. |
| `TZ` | container timezone; `config.yml` `timezone` overrides for stamps |
| `AUTH_SECRET`, `AUTH_URL` | required once any auth provider is set — see [auth](auth.md) |
| `ALLOWED_EMAIL` | single allow-listed address; wins over `operators` |
| `GOOGLE_CLIENT_ID` / `_SECRET`, `GITHUB_CLIENT_ID` / `_SECRET`, `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_NAME` | auth providers |
| `DOCKER_HOST` | point at a non-default (or Podman) socket — see [discovery](discovery.md) |
| `BACKUP_RECEIPTS` | overrides `config.yml` `backup_receipts` |

`config.yml` changes apply immediately (the Settings page saves and reloads). Host and
folder-scanning changes fully apply after the next restart.
