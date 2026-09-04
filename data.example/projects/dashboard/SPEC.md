# Dashboard — spec

One place to see every self-hosted project and the machines they run on, backed
entirely by plain Markdown/YAML so an AI agent can read and write it directly.

## Scope

- Project overview + detail, from `data/projects/<slug>/{project.yml,SPEC.md,STATUS.md}`
- A computed per-project checklist (git state, agent-context files, spec presence,
  open task count) — every answer re-derived from disk, never self-reported
- A standards registry (`data/standards.yml`) scored across every project
- Live container + disk state for the local host, plus discovery of running
  projects that aren't tracked yet
- Cross-host discovery over a least-privilege SSH key
- A planning view for ideas that aren't real projects yet
- Sign-in via OAuth/OIDC, open by default until a provider is configured

## Not in scope

- Editing containers or deploying from the dashboard — it observes, it doesn't act
- Multi-tenant operation of the dashboard itself — one operator per instance. (The
  client portal is a separate deployment of the same image in `BOSUN_MODE=portal`
  that renders a strict per-client projection of the shared data store — see
  `src/lib/portal/`; the operator dashboard stays single-tenant.)
- Storing anything in a database
