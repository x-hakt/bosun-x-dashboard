# Deploying

## From source

```bash
git clone https://github.com/x-hakt/bosun-x-dashboard
cd bosun-x-dashboard
cp -r data.example deploy/data          # your data dir
cp .env.example deploy/.env             # fill in auth, or leave blank for open
cd deploy
docker compose -f docker-compose.example.yml up -d --build
```

`http://localhost:3010`. Put a reverse proxy in front for TLS (there's a commented
Traefik label block in the compose file). **Configure a sign-in provider — or your own
auth proxy — before exposing it.** See [auth](auth.md).

## From the GHCR image

Releases are published to `ghcr.io/x-hakt/bosun-x-dashboard`. In your compose file,
replace the `build:` block with:

```yaml
    image: ghcr.io/x-hakt/bosun-x-dashboard:latest    # or a pinned :v0.1.0
```

then `docker compose pull && docker compose up -d`.

## Updating

- **Source:** `git pull && docker compose up -d --build`
- **Image:** bump the tag (or `docker compose pull` for `:latest`) then `up -d`

Your data directory is never touched by an update — it's a separate bind mount.

## Cutting a release (maintainers)

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow builds and pushes `:v0.1.0`, `:0.1`, and `:latest` to GHCR using
the repo's `GITHUB_TOKEN` (no extra secret). Update `CHANGELOG.md` in the same commit
as the tag.
