# Deploying

Two ways to run it: the **npm package** (a Node process, simplest on a machine you
already use) or the **container image** (isolated, and how the client portal guide
is written). Both read the same data folder and behave the same.

## From npm

```bash
npm install -g bosun-x-dashboard
bosun-x-dashboard --data ~/bosun-data            # or `bosun dashboard` from the CLI
```

`--port` (default 3010) and `--host` (default `127.0.0.1`) choose where it listens;
every other setting is the same environment variables and `config.yml` as the
container. Run it under systemd so it survives reboots: see
[getting started](getting-started.md#8-run-it-as-a-service). Upgrade with
`npm install -g bosun-x-dashboard@latest`.

The package ships the prebuilt server; `npm` installs its runtime dependencies for
your platform. It needs Node.js 20+, and the `docker`, `git` and `ssh` commands for
the live server features.

## From source (Docker)

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

## The client portal

The portal is a **second deployment of the same image** with `BOSUN_MODE=portal`,
pointed at the same data directory and fronted on its own domain. Copy
`deploy/docker-compose.portal.example.yml` and see [the client portal](portal.md)
for `BOSUN_PORTAL`, the required sign-in provider, and the `clients.yml` allowlist.

## Updating

- **npm:** `npm install -g bosun-x-dashboard@latest`, then restart it
- **Source:** `git pull && docker compose up -d --build`
- **Image:** bump the tag (or `docker compose pull` for `:latest`) then `up -d`

Your data directory is never touched by an update — it's a separate bind mount.

## Cutting a release (maintainers)

1. Bump `version` in `package.json` (and the lockfile: `npm install --package-lock-only`),
   move the CHANGELOG's Unreleased notes under the new version, commit.
2. Tag and push; the `Release` workflow builds and pushes `:vX.Y.Z`, `:X.Y` and
   `:latest` to GHCR with the repo's `GITHUB_TOKEN`:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

3. Publish the npm package (npm asks for your one-time password):

   ```bash
   npm run build:npm        # builds from a clean clone of HEAD into ./dist-npm
   npm publish ./dist-npm
   ```

   `npm run pack:npm` makes a `.tgz` instead, to install and try first
   (`npm install -g ./bosun-x-dashboard-X.Y.Z.tgz`). If the major or minor version
   changed, bump `DASHBOARD_RANGE` in the bosun-x CLI so `bosun dashboard` fetches it.
