#!/usr/bin/env node
// secrets-inventory.mjs: the password-manager checklist for the fleet's secrets.
//
// The secrets bundle (fleet-secrets-backup.sh) keeps an encrypted copy of every secret on this box, but the
// bundle's own key, and anything you'd need on a blank machine before you can open a backup, has to live in
// your password manager. This lists every secret file the bundle covers (infra/secrets-backup.yml `paths`,
// directories expanded, public keys skipped) plus `password_manager.only` (secrets kept out of every backup,
// e.g. backup-keys/_secrets.age), and remembers which ones you've recorded.
//
// It never prints a secret value except through --show and --export, and both refuse unless they run in an
// interactive terminal, so cron logs, agents and pipes can't capture one. What it stores is a short fingerprint per
// file (first 12 hex of its sha256), only to notice when a recorded secret changes.
//
//   node scripts/secrets-inventory.mjs                 the checklist: recorded / NEW / CHANGED
//   node scripts/secrets-inventory.mjs --show <n|path> print one secret (interactive terminal only)
//   node scripts/secrets-inventory.mjs --plan          how --export will split them: part names, contents, sizes
//                                                       (no values, so it runs anywhere)
//   node scripts/secrets-inventory.mjs --export [dir]   every secret, in parts that each fit one password-manager
//                                                       entry (interactive terminal only, files mode 600, never
//                                                       overwrites): one entry per part, named like its file;
//                                                       delete the files, --mark all
//                 [--max-chars N]                       a part's size limit (default 9500: under 10,000-character notes)
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
  const state = loadState().recorded ?? {};
  for (const i of items) i.status = !state[i.path] ? "NEW" : state[i.path] === i.fp ? "recorded" : "CHANGED";
  return { items, state };
}

function pick(items, ref) {
  if (/^\d+$/.test(ref)) return items[Number(ref) - 1];
  return items.find((i) => i.path === ref || i.path === tilde(path.resolve(expand(ref))));
}

function loadState() {
  return fs.existsSync(stateFile) ? yamlLoad(fs.readFileSync(stateFile, "utf8")) ?? {} : {};
}
// `export`: the last export's parts, by name, and which files each holds: where to look in the password manager.
function saveState(state, exportIndex = loadState().export) {
  const body = "# secrets-inventory.mjs: secrets recorded in the password manager. Paths and fingerprints only\n" +
    "# (first 12 hex of each file's sha256), so a changed secret shows up again. Never a value.\n" +
    yamlDump({ recorded: state, ...(exportIndex ? { export: exportIndex } : {}) }, { lineWidth: 200, sortKeys: false });
  fs.writeFileSync(stateFile, body);
}

// ---- export in parts (operator 2026-10-06: a 40,000-character export didn't fit a 10,000-character note, so
// last week's entry silently never saved). Each file stays whole in one part; files are grouped by what they
// belong to, and a part is named after its groups so a project's secrets can be found by entry title.
const GROUP_ORDER = ["age-backup-keys", "ssh-keys", "nebula"];
function groupOf(p) {
  if (/\/backup-keys\/[^/]+\.age$/.test(p)) return "age-backup-keys";
  if (p.startsWith("/etc/nebula/")) return "nebula";
  if (p.startsWith("~/.ssh/") || p.startsWith("~/bosun-x-keys/") || /deploy-key$/.test(p)) return "ssh-keys";
  let m = p.match(/^~\/\.config\/([^/]+)\//);
  if (m) return m[1];
  m = p.match(/^~\/(?:unified-services|projects)\/([^/]+)\/\.env/);
  if (m) return m[1];
  if (/^~\/unified-services\/\.[^/]+$/.test(p)) return "unified-services";
  return "other";
}
// A file's export text: whole, or (when it alone is bigger than a part can hold) cut between lines into labelled
// pieces, so a .env setting is never split. A private key block (-----BEGIN ... END-----) is never cut.
function entryPieces(i, room) {
  const bytes = read(expand(i.path));
  const text = bytes ? bytes.toString("utf8") : null;
  const binary = text !== null && text.includes("\uFFFD");
  const only = i.where === "password manager only" ? "  [ONLY copy: not in any backup]" : "";
  const body = bytes === null ? "(unreadable: run with sudo access)" : binary ? bytes.toString("base64") : text.replace(/\n$/, "");
  const whole = `===== ${i.path}${only}${binary ? "  [binary, base64]" : ""} =====\n${body}\n`;
  if (whole.length <= room || binary || bytes === null || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) return [{ label: i.path, text: whole }];
  const lines = body.split("\n");
  const pieces = [];
  let start = 0;
  while (start < lines.length) {
    let end = start, size = 0;
    while (end < lines.length && (size + lines[end].length + 1 <= room - 200 || end === start)) size += lines[end++].length + 1;
    pieces.push({ from: start + 1, to: end, text: lines.slice(start, end).join("\n") });
    start = end;
  }
  return pieces.map((pc, n) => ({
    label: `${i.path} (lines ${pc.from}-${pc.to} of ${lines.length})`,
    text: `===== ${i.path}${only}  [piece ${n + 1} of ${pieces.length}: lines ${pc.from}-${pc.to} of ${lines.length}; join the pieces in order] =====\n${pc.text}\n`,
  }));
}
const HEADER_ALLOWANCE = 1200; // a part's own header and contents list
// -> [{ name, groups: [names], files: [{ path, chars, text? }], chars }]; `text` only when withText.
function planParts(list, { maxChars = 9500, withText = false } = {}) {
  const room = maxChars - HEADER_ALLOWANCE;
  const groups = new Map();
  for (const i of list) {
    const g = groupOf(i.path);
    if (!groups.has(g)) groups.set(g, []);
    for (const pc of entryPieces(i, room)) groups.get(g).push({ path: pc.label, chars: pc.text.length, ...(withText ? { text: pc.text } : {}) });
  }
  const order = [...groups.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const parts = [];
  let cur = null;
  const open = () => (cur = { groups: [], files: [], chars: 0 }, parts.push(cur));
  for (const g of order) {
    const files = groups.get(g);
    const size = files.reduce((n, f) => n + f.chars, 0);
    if (!cur || (cur.chars + size > room && cur.files.length)) open();
    if (size <= room - cur.chars) { cur.groups.push(g); cur.files.push(...files); cur.chars += size; continue; }
    // Too big for one part even on its own: spread over parts, whole files (or whole-line pieces) only.
    const spread = [cur];
    for (const f of files) {
      if (cur.chars + f.chars > room && cur.files.length) { open(); spread.push(cur); }
      cur.files.push(f); cur.chars += f.chars;
      cur.spread = g;
    }
    spread.forEach((pt, n) => pt.groups.push(spread.length > 1 ? `${g}-${n + 1}-of-${spread.length}` : g));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (gs) => gs.join("+").replace(/[^a-z0-9+-]+/gi, "-").slice(0, 120);
  parts.forEach((pt, n) => { pt.name = `secrets-${stamp}-part${n + 1}-of-${parts.length}-${slug(pt.groups)}`; });
  return parts;
}
function partText(pt, n, total) {
  return [
    `Fleet secrets, part ${n} of ${total}: ${pt.groups.join(", ")}. Exported ${new Date().toISOString()} on ${os.hostname()}`,
    `by bosun-x secrets-inventory.mjs. Save this part as ONE password-manager entry titled: ${pt.name}`,
    `Restore a file by pasting what's under its ===== header back to that path (chmod 600 keys). [ONLY copy]`,
    `entries are in no backup; the bundle key opens the nightly encrypted bundle, which holds all the rest.`,
    `In this part (${pt.files.length}):`, ...pt.files.map((f) => `  ${f.path}`), "",
    ...pt.files.map((f) => f.text),
    `===== end of part ${n} of ${total} =====`, "",
  ].join("\n");
}

const argv = process.argv.slice(2);
const maxAt = argv.indexOf("--max-chars");
const maxChars = maxAt >= 0 ? Number(argv.splice(maxAt, 2)[1]) : 9500;
if (!(maxChars >= 2000)) { console.error("--max-chars needs a number of at least 2000"); process.exit(1); }
const [cmd, arg] = argv;
const { items, state } = inventory();
const todo = items.filter((i) => i.status !== "recorded");

if (!cmd) {
  items.forEach((i, n) => console.log(`${String(n + 1).padStart(3)}  ${i.status.padEnd(8)}  ${i.path}${i.where === "password manager only" ? "   [only in the password manager: not in any backup]" : ""}${i.readable ? "" : "   (unreadable: needs sudo)"}`));
  console.log(`\n${items.length} secrets, ${todo.length} still to record. All of them, in entry-sized parts: --plan, then --export; one: --show <n>; once saved: --mark <n> (or --mark all).`);
} else if (cmd === "--show") {
  if (!process.stdout.isTTY) { console.error("--show prints a secret, so it only runs in an interactive terminal (not a pipe, log or agent)."); process.exit(2); }
  const i = arg && pick(items, arg);
  if (!i) { console.error("no such item; run with no arguments for the list"); process.exit(1); }
  const bytes = read(expand(i.path));
  console.log(`----- ${i.path} (${i.status}) -----`);
  process.stdout.write(bytes ? bytes.toString("utf8") : "(unreadable)\n");
  console.log(`----- end; after saving it: --mark ${items.indexOf(i) + 1} -----`);
} else if (cmd === "--plan") {
  const parts = planParts(items, { maxChars });
  parts.forEach((pt, n) => {
    console.log(`${pt.name}.txt  (~${pt.chars + HEADER_ALLOWANCE} chars, ${pt.files.length} files)`);
    for (const f of pt.files) console.log(`    ${f.path}`);
  });
  const big = parts.flatMap((pt) => pt.files).filter((f) => f.chars > maxChars - HEADER_ALLOWANCE);
  if (big.length) console.log(`\nToo big for one entry on their own (attach instead): ${big.map((f) => f.path).join(", ")}`);
  console.log(`\n${items.length} secrets in ${parts.length} parts of at most ${maxChars} characters. --export writes them.`);
} else if (cmd === "--export") {
  // Operator 2026-10-02: few entries, not 43. Same guard as --show; files are created 0600 in a 0700 folder and
  // never overwrite, and the run says what to name each entry and how to get rid of the files.
  if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error("--export writes every secret, so it only runs in an interactive terminal (not a pipe, log or agent)."); process.exit(2); }
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.resolve(expand(arg || `~/secrets-export-${stamp}`));
  try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) {
    console.error(e.code === "EEXIST" ? `${tilde(dir)} already exists; delete it (shred -u ${tilde(dir)}/* && rmdir ${tilde(dir)}) or pass another folder` : `can't create ${tilde(dir)}: ${e.message}`);
    process.exit(1);
  }
  const parts = planParts(items, { maxChars, withText: true });
  parts.forEach((pt, n) => {
    const text = partText(pt, n + 1, parts.length);
    const fd = fs.openSync(path.join(dir, `${pt.name}.txt`), "wx", 0o600);
    fs.writeSync(fd, text);
    fs.closeSync(fd);
    console.log(`${pt.name}.txt  ${text.length} chars${text.length > maxChars ? "  ** over the limit: attach this one as a file **" : ""}`);
    for (const f of pt.files) console.log(`    ${f.path}`);
  });
  saveState(state, { date: stamp, max_chars: maxChars, parts: parts.map((pt) => ({ entry: pt.name, files: pt.files.map((f) => f.path) })) });
  console.log(`\nwrote ${items.length} secrets in ${parts.length} parts to ${tilde(dir)}/ (only you can read them)`);
  console.log("1. one secure note per part, titled exactly like its file name (without .txt). Copy one with:");
  console.log(`   ssh devserver 'cat ${tilde(dir)}/<part file>' | wl-copy`);
  console.log(`2. delete them: shred -u ${tilde(dir)}/* && rmdir ${tilde(dir)}`);
  console.log("3. node scripts/secrets-inventory.mjs --mark all");
  console.log(`(the parts and their files are listed in ${tilde(stateFile)} under export:, paths only)`);
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
    "--body", `${lines.join("; ")}${todo.length > 12 ? `; and ${todo.length - 12} more` : ""}. On the server, in your own terminal: node scripts/secrets-inventory.mjs (in bosun-x-dashboard), then --export (all of them, in parts that fit one entry each) or --show <n>, and --mark once saved.`,
    "--detail", `${todo.length} to record`, "--href", "/backups"]);
  console.log(`${todo.length} to record${r.status === 0 ? "" : ` (notify failed: ${(r.stderr || r.stdout).trim().slice(0, 200)})`}`);
} else {
  console.error("usage: secrets-inventory.mjs [--show <n|path> | --plan | --export [dir] [--max-chars N] | --mark <n|path|all> | --check]");
  process.exit(1);
}
