# bosun-x dashboard

A self-hosted dashboard for the handful of projects you run across a couple of
Linux boxes — **especially if you build them with AI coding agents.**

It tracks *projects*, not just containers: each one has a spec, a live status, a
task board, a cross-agent handoff log, and a computed standards checklist. It
finds services you're running but haven't tracked yet. And every byte of its
state is plain Markdown and YAML on disk, so Claude Code, Codex, or you with a
text editor can all read and write it directly.

The companion CLI + MCP server is [`bosun-x`](https://github.com/x-hakt/bosun-x);
this app uses it and shares its data model.

> **Self-hosted, MIT, no support promised.** It reads your Docker socket and
> SSHes your boxes — it is inherently a thing you run yourself, on a private
> network or behind auth. Issues and PRs welcome; nothing is guaranteed.

## What it does

- **Projects** — one folder per project (`project.yml` + `SPEC.md` / `STATUS.md` /
  `tasks.yml`), rendered as an overview and a detail page. The task board inside
  `STATUS.md` regenerates itself from `tasks.yml`.
- **Standards** — a small registry of checks (`git remote present`, `has a spec`,
  `handoff ready`, `backup fresh`…) scored against every project. Every answer is
  re-derived from `git`, the filesystem, and the Docker socket — never a ticked box.
- **Infrastructure** — live container and disk state for the local host; a network
  map for the rest; discovery that groups running containers into projects and
  flags the ones you don't track yet.
- **Handoff** — an append-only `HANDOFF.md` + a bounded `HANDOFF.yml` snapshot per
  project, so the next session (agent or human) resumes without re-deriving state.
  Driven by the `bosun-x` CLI.
- **Planning** — ideas that aren't real projects yet.

## Quick start (self-host)

```bash
git clone https://github.com/x-hakt/bosun-x-dashboard
cd bosun-x-dashboard

cp -r data.example deploy/data      # your data dir — edit it freely
cp .env.example deploy/.env         # leave auth blank to run open, or fill it in

cd deploy
docker compose -f docker-compose.example.yml up -d --build
```

Then open `http://localhost:3010`. Put a reverse proxy in front for TLS, and
**configure a sign-in provider (or your own auth proxy) before exposing it** —
see [`docs/auth.md`](docs/auth.md). Instance settings (timezone, operators,
where your projects live, remote hosts) are on the **Settings** page or in
`<data>/config.yml`; a first-run `bosun setup` wizard scaffolds it.

## Local development

```bash
npm install
npm run init-data   # seeds ./data from data.example/
npm run dev
```

`data.example/` is a fully fictional demo dataset — a home server + a cloud VPS
running a blog, a photo library, a recipes API, and a couple of hobby projects.
`data.example/projects/dashboard/SPEC.md` is the design doc; `AGENTS.md` /
`CLAUDE.md` hold the agent-facing conventions.

## License

MIT.
