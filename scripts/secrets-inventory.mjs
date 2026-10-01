#!/usr/bin/env node
// secrets-inventory.mjs: the password-manager checklist for the fleet's secrets.
//
// The secrets bundle (fleet-secrets-backup.sh) keeps an encrypted copy of every secret on this box, but the
// bundle's own key, and anything you'd need on a blank machine before you can open a backup, has to live in
// your password manager. This lists every secret file the bundle covers (infra/secrets-backup.yml `paths`,
// directories expanded, public keys skipped) plus `password_manager.only` (secrets kept out of every backup,
// e.g. backup-keys/_secrets.age), and remembers which ones you've recorded.
//
// It never prints a secret value except through --show, and --show refuses unless stdout is an interactive
// terminal, so cron logs, agents and pipes can't capture one. What it stores is a short fingerprint per
// file (first 12 hex of its sha256), only to notice when a recorded secret changes.
//
//   node scripts/secrets-inventory.mjs                 the checklist: recorded / NEW / CHANGED
//   node scripts/secrets-inventory.mjs --show <n|path> print one secret (interactive terminal only)
//   node scripts/secrets-inventory.mjs --mark <n|path|all>   record it as saved in the password manager
//   node scripts/secrets-inventory.mjs --check         nightly: raise/resolve the Needs-you row (no values)
//
// State: $BOSUN_DATA/infra/password-manager.yml (paths + fingerprints only).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { resolveDataDir } from "./lib/data-dir.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = resolveDataDir(repoRoot);
const configFile = path.join(data, "infra/secrets-backup.yml");
const stateFile = path.join(data, "infra/password-manager.yml");
const NOTIFY_KEY = "secrets:password-manager";

const home = os.homedir();
const expand = (p) => (p.startsWith("~/") ? path.join(home, p.slice(2)) : p);
const tilde = (p) => (p.startsWith(home + "/") ? "~/" + p.slice(home.length + 1) : p);

// Read a file as this user, or through `sudo -n` for root-owned paths (as the bundle does). Never throws.
function read(file) {
  try { return fs.readFileSync(file); } catch {}
  const r = spawnSync("sudo", ["-n", "cat", "--", file], { maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })); } catch {}
  const r = spawnSync("sudo", ["-n", "find", dir, "-mindepth", "1", "-maxdepth", "1", "-printf", "%y %f\\n"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout.split("\n").filter(Boolean).map((l) => ({ name: l.slice(2), dir: l[0] === "d" }));
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch {}
  return spawnSync("sudo", ["-n", "test", "-d", p]).status === 0;
}
// Bash-style globbing for the config's patterns: *, ? and [..] / [!..] within one path segment.
function glob(pattern) {
  const parts = pattern.split("/");
  let found = [parts[0] === "" ? "/" : parts[0]];
  for (const part of parts.slice(1)) {
    if (!part) continue;
    if (!/[*?[]/.test(part)) { found = found.map((b) => path.join(b, part)); continue; }
    const re = new RegExp("^" + part.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\[!/g, "[^") + "$");
    found = found.flatMap((b) => listDir(b).filter((e) => re.test(e.name) && !e.name.startsWith(".") || (re.test(e.name) && part.startsWith("."))).map((e) => path.join(b, e.name)));
  }
  return found.filter((p) => fs.existsSync(p) || spawnSync("sudo", ["-n", "test", "-e", p]).status === 0);
}
const notSecret = (name) => name.endsWith(".pub") || /known_hosts/.test(name) || /\.example$/.test(name);
// Old copies (foo.bak-20260930, a backup-20260829/ folder) stay in the encrypted bundle but don't need their own
// password-manager entry: you record the current secret.
const backupCopy = (name) => /\.bak\b|\.bak[-.]|^backup-\d/.test(name);
function files(p) {
  if (!isDir(p)) return [p];
  return listDir(p).filter((e) => !backupCopy(e.name)).flatMap((e) => (e.dir ? files(path.join(p, e.name)) : notSecret(e.name) ? [] : [path.join(p, e.name)]));
}

function inventory() {
  const cfg = yamlLoad(fs.readFileSync(configFile, "utf8")) ?? {};
  const only = (cfg.password_manager?.only ?? []).map(String);
  const items = [];
  const seen = new Set();
  const add = (file, where) => {
    if (seen.has(file)) return;
    seen.add(file);
    const bytes = read(file);
    items.push({ path: tilde(file), where, readable: !!bytes,
      fp: bytes ? crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12) : null });
  };
  for (const p of only) for (const f of glob(expand(p)).flatMap(files)) add(f, "password manager only");
  for (const p of (cfg.paths ?? []).map(String)) for (const f of glob(expand(p)).flatMap(files)) add(f, "bundle");
  const state = fs.existsSync(stateFile) ? (yamlLoad(fs.readFileSync(stateFile, "utf8"))?.recorded ?? {}) : {};
  for (const i of items) i.status = !state[i.path] ? "NEW" : state[i.path] === i.fp ? "recorded" : "CHANGED";
  return { items, state };
}

function pick(items, ref) {
  if (/^\d+$/.test(ref)) return items[Number(ref) - 1];
  return items.find((i) => i.path === ref || i.path === tilde(path.resolve(expand(ref))));
}

function saveState(state) {
  const body = "# secrets-inventory.mjs: secrets recorded in the password manager. Paths and fingerprints only\n" +
    "# (first 12 hex of each file's sha256), so a changed secret shows up again. Never a value.\n" +
    yamlDump({ recorded: state }, { lineWidth: 200, sortKeys: true });
  fs.writeFileSync(stateFile, body);
}

const [cmd, arg] = process.argv.slice(2);
const { items, state } = inventory();
const todo = items.filter((i) => i.status !== "recorded");

if (!cmd) {
  items.forEach((i, n) => console.log(`${String(n + 1).padStart(3)}  ${i.status.padEnd(8)}  ${i.path}${i.where === "password manager only" ? "   [only in the password manager: not in any backup]" : ""}${i.readable ? "" : "   (unreadable: needs sudo)"}`));
  console.log(`\n${items.length} secrets, ${todo.length} still to record. Show one: --show <n>; once saved: --mark <n> (or --mark all).`);
} else if (cmd === "--show") {
  if (!process.stdout.isTTY) { console.error("--show prints a secret, so it only runs in an interactive terminal (not a pipe, log or agent)."); process.exit(2); }
  const i = arg && pick(items, arg);
  if (!i) { console.error("no such item; run with no arguments for the list"); process.exit(1); }
  const bytes = read(expand(i.path));
  console.log(`----- ${i.path} (${i.status}) -----`);
  process.stdout.write(bytes ? bytes.toString("utf8") : "(unreadable)\n");
  console.log(`----- end; after saving it: --mark ${items.indexOf(i) + 1} -----`);
} else if (cmd === "--mark") {
  const chosen = arg === "all" ? items : [arg && pick(items, arg)].filter(Boolean);
  if (!chosen.length) { console.error("no such item"); process.exit(1); }
  for (const i of chosen) if (i.fp) state[i.path] = i.fp;
  for (const p of Object.keys(state)) if (!items.some((i) => i.path === p)) delete state[p]; // gone from the config
  saveState(state);
  console.log(`recorded ${chosen.length}; ${items.filter((i) => state[i.path] !== i.fp).length} still to record`);
} else if (cmd === "--check") {
  const notify = (args) => spawnSync("npm", ["run", "-s", "notify", "--", ...args], { cwd: repoRoot, encoding: "utf8" });
  if (!todo.length) { notify(["resolve", "--key", NOTIFY_KEY]); console.log("all secrets recorded"); process.exit(0); }
  const only = todo.filter((i) => i.where === "password manager only");
  const lines = todo.slice(0, 12).map((i) => `${i.status === "CHANGED" ? "changed: " : ""}${i.path}`);
  const r = notify(["raise", "--key", NOTIFY_KEY, "--level", only.length ? "warn" : "info",
    "--title", `${todo.length} secret${todo.length === 1 ? "" : "s"} to save in your password manager`,
    "--body", `${lines.join("; ")}${todo.length > 12 ? `; and ${todo.length - 12} more` : ""}. On the server, in your own terminal: node scripts/secrets-inventory.mjs (in bosun-x-dashboard), then --show <n> and --mark <n> once saved.`,
    "--detail", `${todo.length} to record`, "--href", "/backups"]);
  console.log(`${todo.length} to record${r.status === 0 ? "" : ` (notify failed: ${(r.stderr || r.stdout).trim().slice(0, 200)})`}`);
} else {
  console.error("usage: secrets-inventory.mjs [--show <n|path> | --mark <n|path|all> | --check]");
  process.exit(1);
}
