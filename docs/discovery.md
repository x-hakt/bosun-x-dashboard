# Discovery

The dashboard finds running services you haven't tracked yet, and matches the ones you
have. It **only ever reads** — discovery never starts, stops, or changes a container.

## How it works

1. **Local host** — reads the Docker socket (`/var/run/docker.sock`, mounted read-only)
   and parses `docker-compose*.yml` files under `config.yml` `project_roots`.
2. **Remote hosts** — any host in `infra/hosts.yml` with `live_monitored: true` and an
   `ssh_alias` is swept over SSH using a dedicated least-privilege key.
3. Containers are grouped into candidate projects by their `com.docker.compose.project`
   label, or — for containers that have drifted from their compose file — by
   cross-referencing the compose file on disk by name.
4. A candidate is **matched** to a tracked project when a `project.yml` claims that
   host+path, names one of the containers, or lists it under `also_on`. Unmatched
   candidates show up as "Unregistered — found running, not tracked". Nothing is
   auto-imported; you add a `project.yml` if you want one tracked.

## Remote hosts: `setup-remote.sh`

Never give the dashboard your normal SSH key. `scripts/setup-remote.sh` mints a
dedicated credential that can only run one fixed read-only command on the target:

```bash
./scripts/setup-remote.sh <host-id> [user@hostname]
```

It writes a keypair, a forced-command script, the exact `authorized_keys` line, and an
`ssh_config` Host block under `./discovery-ssh/`. Follow the printed steps: install the
script + `authorized_keys` line on the target (additive — it touches nothing else),
mount `./discovery-ssh` into the container, point `config.yml` `ssh_config` at it, and
add the host to `infra/hosts.yml`.

The restriction is `command="...",restrict` — no pty, no forwarding, no `~/.ssh/rc`.
Verify it: `ssh -i <key> user@host 'id'` should run the discovery script, not `id`, and
`ssh -tt` should be refused. See [security](security.md).

If the target is reachable only through a jump host, add `ProxyJump` to the Host block
and give the jump host a matching line with `permitopen="TARGET:22"` instead of plain
`restrict`.

## Podman

Podman exposes a Docker-compatible API, so most of this works unchanged.

- **Local socket** — set `DOCKER_HOST=unix:///run/podman/podman.sock` (rootful) or
  `unix:///run/user/<uid>/podman/podman.sock` (rootless) and mount that path into the
  container. The dashboard reads `DOCKER_HOST` when it's set.
- **Compose labels** — modern `podman compose` writes `com.docker.compose.*` labels;
  older `podman-compose` writes `io.podman.compose.*`. Both are read.
- **Remote Podman host** — in the forced-command script (`<host-id>.command` from
  `setup-remote.sh`), change the last two lines from `docker` to `podman`.
