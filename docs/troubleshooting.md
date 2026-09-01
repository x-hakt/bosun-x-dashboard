# Troubleshooting

### The dashboard is open — no login wall

No auth provider is configured. That's the intended default. Set one in `.env`
(`GOOGLE_CLIENT_ID`/`_SECRET`, or GitHub, or OIDC) plus `AUTH_SECRET` and `AUTH_URL`.
See [auth](auth.md).

### Signed in but bounced straight back to the login page

The email isn't allow-listed. Add it to `operators:` in `config.yml` or set
`ALLOWED_EMAIL`. A provider that hides the email (GitHub with a private email) must
expose a verified one for the match.

### No containers / disk shown for the local host

The Docker socket isn't mounted, or `DOCKER_HOST` points somewhere unreachable. Check
the `- /var/run/docker.sock:/var/run/docker.sock:ro` volume, or your `DOCKER_HOST`.
Podman: mount the podman socket and set `DOCKER_HOST` to it.

### A remote host shows "couldn't reach for discovery"

Network or SSH, not credentials. From the dashboard host:
`ssh -F <ssh_config> <alias> id` — it should print the discovery script's output. Check
the host is up, the key is mounted at the path the ssh config expects, and
`config.yml` `ssh_config` points at the right file.

### A tracked project shows "Unregistered" for its own running containers

The `project.yml` `host` + `path` don't match where discovery found it, and none of its
`containers:` names match either. Fix `host`/`path`, or add an `also_on:` entry for the
second deployment.

### Standards checks read "n/a" for a project

Either it's `vendored: true`, has no `path:`, or its `host` isn't the local host and has
no discovery `ssh_alias` — so there's no way to run `git`/file checks. That's expected,
not a failure.

### STATUS.md has two task boards

Old `<!-- control-room:task-board -->` markers alongside the new `<!-- bosun:task-board -->`
ones. Delete the old block; the next task edit regenerates the new one. Or run
`npm run handoff -- doctor --fix`.

### `npm ci` fails on the `bosun-x` dependency

It's a `github:` URL that the lockfile resolves over SSH. Run
`git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"` first
(the Dockerfile and CI already do this).
