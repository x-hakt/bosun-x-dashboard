#!/usr/bin/env node
// bosun-x-dashboard: run the bosun-x web dashboard from npm.
//
//   npx bosun-x-dashboard --demo              try it on sample data, nothing to set up
//   npx bosun-x-dashboard --data ~/bosun-data  your own data folder
//   bosun dashboard                            the same, via the bosun-x CLI
//
// This is the published launcher (the npm package is built by scripts/build-npm.mjs in
// the bosun-x-dashboard repo). It resolves the data folder, sets the environment the
// Next.js server expects, and runs the prebuilt server in app/.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(pkgRoot, "app");
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

const HELP = `bosun-x dashboard ${pkg.version}

Usage: bosun-x-dashboard [options]

  --data <dir>     your bosun-x data folder (the one holding projects/)
                   default: $BOSUN_DATA, else $DATA_DIR, else the current folder
                   if it looks like one (has projects/ or config.yml)
  --demo           run on a fresh copy of the sample data instead
  --port <n>       port to listen on (default 3010, or $PORT)
  --host <addr>    address to bind (default 127.0.0.1: this machine only)
  --open           open it in your browser once it's up
  -v, --version    print the version
  -h, --help       this help

Sign-in is off until you configure a provider (Google, GitHub or OIDC) in the
environment; see https://github.com/x-hakt/bosun-x-dashboard/blob/main/docs/auth.md
Everything else is in the data folder's config.yml or the Settings page.
Docs: https://github.com/x-hakt/bosun-x-dashboard/blob/main/docs/getting-started.md`;

function fail(message) {
  console.error(`bosun-x-dashboard: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { demo: false, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--data") opts.data = value();
    else if (a.startsWith("--data=")) opts.data = a.slice(7);
    else if (a === "--port") opts.port = value();
    else if (a.startsWith("--port=")) opts.port = a.slice(7);
    else if (a === "--host") opts.host = value();
    else if (a.startsWith("--host=")) opts.host = a.slice(7);
    else if (a === "--demo") opts.demo = true;
    else if (a === "--open") opts.open = true;
    else if (a === "-v" || a === "--version") {
      console.log(pkg.version);
      process.exit(0);
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else fail(`unknown option ${a} (see --help)`);
  }
  return opts;
}

const expandHome = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
const looksLikeData = (dir) => fs.existsSync(path.join(dir, "projects")) || fs.existsSync(path.join(dir, "config.yml"));

function resolveData(opts) {
  if (opts.demo) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bosun-x-demo-"));
    fs.cpSync(path.join(appDir, "data.example"), dir, { recursive: true });
    return { dir, demo: true };
  }
  const explicit = opts.data || process.env.BOSUN_DATA || process.env.DATA_DIR;
  if (explicit) {
    const dir = path.resolve(expandHome(explicit));
    if (!fs.existsSync(dir)) fail(`data folder ${dir} doesn't exist (create it with \`bosun setup\`, or try --demo)`);
    return { dir, demo: false };
  }
  if (looksLikeData(process.cwd())) return { dir: process.cwd(), demo: false };
  console.error(`No data folder found: ${process.cwd()} has no projects/ or config.yml.

  Try it on sample data:     npx bosun-x-dashboard --demo
  Point it at your data:     npx bosun-x-dashboard --data ~/bosun-data
  Start a new data folder:   mkdir ~/bosun-data && cd ~/bosun-data && npx bosun-x setup`);
  process.exit(1);
}

// next-auth needs a stable secret even when sign-in is off. Keep one per machine,
// outside the data folder (which is often a git repo).
function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const file = path.join(base, "bosun-x", "auth-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {}
  const secret = crypto.randomBytes(33).toString("base64");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, secret + "\n", { mode: 0o600 });
  } catch {
    // Unwritable config dir: still run, with a per-process secret (sessions won't survive a restart).
  }
  return secret;
}

const signInConfigured = () =>
  Boolean(
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
      (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) ||
      (process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
  );

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {}
}

async function waitUntilUp(url, ms = 30_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const opts = parseArgs(process.argv.slice(2));
if (Number.parseInt(process.versions.node, 10) < 20) fail(`needs Node.js 20 or newer (this is ${process.versions.node})`);
if (!fs.existsSync(path.join(appDir, "server.js"))) fail(`the prebuilt server is missing from ${appDir}; reinstall the package`);

const { dir: dataDir, demo } = resolveData(opts);
const port = String(opts.port || process.env.PORT || 3010);
const host = opts.host || "127.0.0.1";
const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

if (!loopback && !signInConfigured()) {
  console.error(`
  !! Binding to ${host} with NO sign-in configured: anyone who can reach this port can
  !! read and edit your projects. Configure a provider first (docs/auth.md), or put it
  !! behind your own authenticating proxy, or drop --host to keep it on this machine.
`);
}

const url = `http://${loopback ? "localhost" : host}:${port}`;
console.log(`bosun-x dashboard ${pkg.version}
  data:  ${dataDir}${demo ? "  (sample data, a fresh copy: changes aren't kept)" : ""}
  open:  ${url}
  stop:  Ctrl+C`);

const child = spawn(process.execPath, [path.join(appDir, "server.js")], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATA_DIR: dataDir,
    BOSUN_DATA: dataDir,
    PORT: port,
    HOSTNAME: host,
    AUTH_SECRET: authSecret(),
    AUTH_URL: process.env.AUTH_URL || url,
  },
});

// A stop we were asked for is a clean exit, however the server reports it: Next exits
// 130/143 (128 + signal) on SIGINT/SIGTERM, and systemd's stop signals the whole unit, so
// passing that code through marks every `systemctl stop` as a failure.
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    child.kill(sig);
  });
}
child.on("exit", (code, signal) => {
  if (demo) fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(signal || stopping || code === 130 || code === 143 ? 0 : code ?? 0);
});

if (opts.open) {
  waitUntilUp(url).then((up) => up && openBrowser(url));
}
