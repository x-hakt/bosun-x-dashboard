# bosun-x dashboard

**One page for everything your AI agents are working on.** Every project's task
board, the live handoff between agents, your servers and what's running on them,
backups that actually get checked, and ideas that aren't projects yet. Self-hosted,
and built on a folder of plain Markdown and YAML that you, Claude, Codex or any other
agent can read and write directly.

```bash
npx bosun-x-dashboard --demo
```

That runs it on sample data at <http://localhost:3010>. Nothing to set up, and nothing
is kept when you stop it.

![A project's page: task board, active handoff, spec and docs](https://x-hakt.com/shots/bosun-project.webp)

## What you get

- **Projects**: one page per project with its task board, spec, status and the
  running handoff log, all rendered from files in the data folder and editable in place.
- **Handoff**: which agent holds each project right now, what it last did, what's
  next, and a staleness clock, so the next session (Claude, Codex or you) resumes
  instead of re-deriving everything.
- **Servers and capacity**: live containers per server, grouped into projects; RAM,
  CPU and disk split by project with typical (p95) and peak usage; a move simulator
  that says whether a project would fit on another server before you try it.
- **Standards**: checks like "has a git remote", "has a spec", "backup fresh", scored
  against every project from git, the filesystem and Docker, never a ticked box.
- **Backups**: which jobs ran, which quietly didn't, restore runbooks and a weekly
  restore test.
- **Planning**: ideas and sub-ideas with a discussion thread each, graduating into
  projects when they're ready.
- **Client portal** (optional): a second deployment that shows each client only the
  work you've shared with them, with replies and sign-off.
- Works on a phone too.

![Capacity: each server's RAM, CPU and disk split by project (demo data)](https://x-hakt.com/shots/bosun-capacity.webp)

## Use it with your own data

The dashboard reads a **data folder**: one directory per project under `projects/`,
plus an optional `config.yml`. Make one with the bosun-x CLI's setup wizard:

```bash
mkdir ~/bosun-data && cd ~/bosun-data
npx bosun-x setup            # timezone, who can sign in, where your projects live
npx bosun-x-dashboard        # run from inside the data folder...
npx bosun-x-dashboard --data ~/bosun-data   # ...or point at it from anywhere
```

Or through the CLI, which finds the same data folder it uses for handoffs:

```bash
npm install -g bosun-x
bosun dashboard
```

Options:

| | |
|---|---|
| `--data <dir>` | the data folder (default: `$BOSUN_DATA`, else the current folder if it has `projects/` or `config.yml`) |
| `--demo` | a fresh copy of the sample data instead |
| `--port <n>` | default `3010` |
| `--host <addr>` | default `127.0.0.1` (this machine only) |
| `--open` | open your browser once it's up |

## Before you open it up

Out of the box there is **no sign-in**, which is fine on `localhost` and nowhere
else. Before binding it to a network (`--host 0.0.0.0`) or putting it behind a
domain, configure Google, GitHub or any OIDC provider plus an email allowlist, or
put it behind your own authenticating proxy. The launcher warns you if you try
otherwise. See [docs/auth.md](https://github.com/x-hakt/bosun-x-dashboard/blob/main/docs/auth.md).

## Requirements

- Node.js 20 or newer.
- For the live server features: a Linux host, the `docker` CLI and access to the
  Docker socket (or Podman via `DOCKER_HOST`), `git`, and `ssh` for remote servers.
  Without them, projects, tasks, handoff, planning and notes all still work; the
  server panels just show nothing live.

Prefer containers? The same dashboard ships as an image,
`ghcr.io/x-hakt/bosun-x-dashboard`. See
[docs/deploying.md](https://github.com/x-hakt/bosun-x-dashboard/blob/main/docs/deploying.md).

## Learn more

- **[Getting started](https://github.com/x-hakt/bosun-x-dashboard/blob/main/docs/getting-started.md)**:
  install, your first data folder, wiring an AI agent, running it as a service.
- **[All docs](https://github.com/x-hakt/bosun-x-dashboard/tree/main/docs)**:
  configuration, discovery, capacity, backups and restore, the client portal, security.
- **[bosun-x](https://www.npmjs.com/package/bosun-x)**: the CLI and MCP server your
  agents use to check in and out. The dashboard is where you look at all of it at once.
- **[x-hakt.com/locker/bosun-x](https://x-hakt.com/locker/bosun-x)**: the product page.

MIT licensed.
