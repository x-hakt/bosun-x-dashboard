# Getting started

bosun-x is two things over one folder of plain files:

- **the dashboard** (this repo, npm package `bosun-x-dashboard`): the web app where
  you see and edit every project, task board, handoff, server and backup;
- **the CLI and MCP server** (npm package [`bosun-x`](https://github.com/x-hakt/bosun-x)):
  what your AI agents (and you) use to check work in and out, so the dashboard is
  always telling the truth.

Both read and write a **data folder**: one directory per project under `projects/`,
an optional `config.yml`, and a few other plain Markdown/YAML files. There is no
database. Anything you can do in the dashboard you can also do in a text editor.

## 1. Try it (one minute)

Needs Node.js 20 or newer.

```bash
npx bosun-x-dashboard --demo --open
```

The dashboard opens at <http://localhost:3010> on a fresh copy of the sample data
(a few fictional projects, servers and backups). Click around; nothing you change is
kept. `Ctrl+C` stops it.

## 2. Install

```bash
npm install -g bosun-x bosun-x-dashboard
```

That gives you `bosun` (the CLI), `bosun-mcp` (the MCP server) and
`bosun-x-dashboard`. `bosun dashboard` runs the dashboard too; without the second
package installed it fetches the matching version on demand.

## 3. Make your data folder

```bash
mkdir ~/bosun-data && cd ~/bosun-data
bosun setup
```

The wizard asks for your timezone, who may sign in, and (if you'll run the
dashboard) this machine's name, where your projects' compose files live, and the SSH
config for remote servers. It writes `projects/`, `config.yml` and, if you said yes to
the dashboard, a skeleton `infra/hosts.yml`. Everything it asks is also on the
dashboard's **Settings** page later.

Keeping the data folder in git is a good idea: every change is a readable diff.

### Add a project

A project is a folder with a `project.yml`. The minimum:

```bash
mkdir -p projects/my-app
cat > projects/my-app/project.yml <<'EOF'
name: my-app
slug: my-app          # matches the folder name
stage: active
status: Development   # free text: Live, Development, Paused, ...
host: home-server     # the machine it runs on (an id from infra/hosts.yml)
path: /home/me/my-app # where its code lives on that machine
EOF
```

Add `SPEC.md`, `STATUS.md` and `tasks.yml` whenever you like; the dashboard renders
whatever is there. The full set of fields is in [projects](projects.md). Services
already running on your machines show up under **Projects → Unregistered** so you can
see what isn't tracked yet.

## 4. Open the dashboard

```bash
cd ~/bosun-data && bosun dashboard --open
```

or from anywhere with `bosun-x-dashboard --data ~/bosun-data` (or set
`BOSUN_DATA=~/bosun-data`). What's on it:

| Page | What it shows |
| --- | --- |
| **Overview** | every project's state, what needs attention, backup warnings |
| **Projects** | each project's task board, spec, status, handoff log and containers |
| **Planning** | ideas and sub-ideas with a thread each, before they become projects |
| **Servers** | each machine's live containers, and the [capacity](capacity.md) view |
| **Backups** | job freshness, missed runs, restore runbooks ([restore](restore.md)) |
| **Standards** | checks scored against every project from git, files and Docker |
| **Notes / Messages** | freeform notes, and threads with client portals |
| **Settings** | everything in `config.yml`, with help text and defaults |

Options: `--port` (default 3010), `--host` (default `127.0.0.1`, this machine only),
`--data`, `--demo`, `--open`.

## 5. Wire up your agents

In each project's repository:

```bash
bosun init
```

adds a short managed block to the repo's `CLAUDE.md` / `AGENTS.md` (or Cursor/Copilot
equivalent) telling the agent to start, checkpoint and finish its work with bosun-x.
Then give the agent the MCP server so it has real tools:

```json
{
  "mcpServers": {
    "bosun-x": { "command": "bosun-mcp", "env": { "BOSUN_DATA": "/home/me/bosun-data" } }
  }
}
```

From then on each session starts with `bosun resume my-app` (or the MCP
`project_brief` tool), and the dashboard shows who holds which project and what they
did last. The details are in the [bosun-x README](https://github.com/x-hakt/bosun-x#wiring-an-agent).

## 6. Servers, containers and capacity

The dashboard reads **this machine's Docker** directly: the user running it needs
access to the Docker socket (on Linux, membership of the `docker` group), plus the
`docker`, `git` and `ssh` commands on the PATH. Podman works through `DOCKER_HOST`
([discovery](discovery.md#podman)).

**Other machines** are read over SSH with a dedicated key that can only run one
read-only command: `scripts/setup-remote.sh` in this repo mints it
([discovery](discovery.md)). Add each machine to `infra/hosts.yml` with its
`ssh_alias`.

For per-project RAM, CPU and disk with typical and peak usage, add the two
capacity cron lines from [capacity](capacity.md#setup).

Without Docker or SSH everything else (projects, tasks, handoff, planning, notes,
standards that don't need Docker) works; the server panels just show nothing live.

**On macOS** the dashboard runs, and shows your local containers, but this machine's
own memory, disk and load are read with Linux tools and aren't available: its host
tiles say so, and it has no capacity bars. The capacity sampler is Linux-only. Remote
Linux servers show in full. With Docker Desktop, if no local containers appear, set
`DOCKER_HOST=unix://$HOME/.docker/run/docker.sock`. On Windows, run it inside WSL.

## 7. Before anyone else can reach it: sign-in

Out of the box there is no sign-in. That's fine on `localhost` and nowhere else. To
open it to your network or put it behind a domain, set a provider in the environment
and allow your email:

```bash
export AUTH_URL=https://bosun.example.com      # its public URL
export GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=...   # or GOOGLE_* / OIDC_*
export ALLOWED_EMAIL=you@example.com           # or `operators:` in config.yml
bosun-x-dashboard --data ~/bosun-data --host 0.0.0.0
```

Put TLS in front (Caddy, Traefik, nginx). The launcher warns loudly if you bind to a
network address with no provider configured. Details: [auth](auth.md),
[security](security.md).

## 8. Run it as a service

A systemd user service keeps it running and restarts it after a reboot:

```ini
# ~/.config/systemd/user/bosun-x-dashboard.service
[Unit]
Description=bosun-x dashboard
After=network-online.target

[Service]
EnvironmentFile=-%h/.config/bosun-x/dashboard.env
ExecStart=/usr/bin/env bosun-x-dashboard --data %h/bosun-data
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now bosun-x-dashboard
loginctl enable-linger "$USER"      # keep it running when you're logged out
```

Put `PORT`, the sign-in variables and anything else from [configuration](configuration.md)
in `~/.config/bosun-x/dashboard.env`, one `KEY=value` per line. If `bosun-x-dashboard`
isn't on systemd's PATH (a Node version manager, say), use its full path from
`command -v bosun-x-dashboard`.

**Prefer containers?** The same dashboard is published as
`ghcr.io/x-hakt/bosun-x-dashboard`; see [deploying](deploying.md). The optional
[client portal](portal.md) is a second instance over the same data folder
(`BOSUN_MODE=portal`), set up the same way; its guide uses containers.

## 9. Updating

```bash
npm install -g bosun-x@latest bosun-x-dashboard@latest
systemctl --user restart bosun-x-dashboard     # if it runs as a service
```

Your data folder is never touched by an update. The [changelog](../CHANGELOG.md) lists
what changed.

## Where next

- [Configuration](configuration.md): every `config.yml` key and environment variable
- [Projects](projects.md): `project.yml`, tasks, status boards, backups
- [Capacity](capacity.md): the Servers capacity view, sampler and move simulator
- [Client portal](portal.md): a per-client view of shared work
- [Troubleshooting](troubleshooting.md)
