# Changelog

All notable changes to the bosun-x dashboard. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are the `vX.Y.Z` tags
that trigger a GHCR image build.

## Unreleased

### Added
- `scripts/setup-remote.sh` — mint a least-privilege discovery SSH credential for a host.
- GHCR release workflow: `git tag vX.Y.Z && git push --tags` publishes
  `ghcr.io/x-hakt/bosun-x-dashboard`.
- CI workflow: tsc + lint + build on every push and PR.
- Podman: honours `DOCKER_HOST` for the local socket; reads `io.podman.compose.*`
  labels as a fallback for discovery grouping.
- `docs/` — configuration, projects, discovery, deploying, security, troubleshooting.

### Changed
- First public release, extracted from a private working repo (`x-hakt/control-room`).
  Consumes the [`bosun-x`](https://github.com/x-hakt/bosun-x) CLI/MCP package.
