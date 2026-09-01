# Docs

- **[Configuration](configuration.md)** — `config.yml` and environment variables
- **[Projects](projects.md)** — `project.yml`, `tasks.yml`, `STATUS.md`, `backups.yml`
- **[Discovery](discovery.md)** — how running services are found; `setup-remote.sh`; Podman
- **[Auth](auth.md)** — Google / GitHub / OIDC sign-in and the email allowlist
- **[Deploying](deploying.md)** — Docker Compose, the GHCR image, updating
- **[Security](security.md)** — what the app can reach and how it's constrained
- **[Troubleshooting](troubleshooting.md)**

The data model in one line: one directory per project under `<DATA_DIR>/projects/<slug>/`,
everything plain Markdown/YAML, editable by hand or by an AI agent. Seed it from
[`data.example/`](../data.example).
