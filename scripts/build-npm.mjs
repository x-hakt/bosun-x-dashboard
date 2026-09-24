#!/usr/bin/env node
// Build the publishable npm package `bosun-x-dashboard` into ./dist-npm.
//
//   node scripts/build-npm.mjs            build + stage ./dist-npm
//   node scripts/build-npm.mjs --pack     ...and `npm pack` it (a .tgz to inspect or install)
//   npm publish ./dist-npm                publish (npm asks for your one-time password)
//
// Always builds from a clean clone of the committed HEAD, never the working tree: a
// local data/ folder can hold real operator data, and Next's standalone output copies
// whatever sits in the project folder. The result is checked before it's staged.
//
// What ships: the Next standalone server (app/server.js + app/.next), static assets,
// public/, data.example/ (for --demo), the launcher (bin/), README, LICENSE. The server's
// runtime dependencies are declared, not bundled, so npm installs the right native
// binaries for the user's platform.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-npm");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const say = (m) => console.log(`\n[build-npm] ${m}`);

const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
if (dirty) say("note: uncommitted changes are NOT included (building from HEAD)");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bosun-x-dashboard-npm-"));
const src = path.join(tmp, "src");
try {
  say(`clean clone of HEAD → ${src}`);
  run("git", ["clone", "--quiet", "--no-hardlinks", root, src]);
  // The lockfile resolves the github: devDependency over ssh; https works without keys.
  run("git", ["config", "url.https://github.com/.insteadOf", "ssh://git@github.com/"], src);
  say("npm ci");
  run("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], src);
  say("next build");
  run("npm", ["run", "build"], src);

  const standalone = path.join(src, ".next", "standalone");
  const appPkg = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"));

  // Runtime dependencies = the app's own dependencies that Next left external
  // (present at the top of the standalone node_modules), at their installed versions.
  const traced = new Set(
    fs.readdirSync(path.join(standalone, "node_modules")).flatMap((n) =>
      n.startsWith("@") ? fs.readdirSync(path.join(standalone, "node_modules", n)).map((m) => `${n}/${m}`) : [n],
    ),
  );
  const dependencies = {};
  for (const name of Object.keys(appPkg.dependencies ?? {})) {
    if (!traced.has(name)) continue;
    const installed = JSON.parse(fs.readFileSync(path.join(src, "node_modules", name, "package.json"), "utf8"));
    dependencies[name] = installed.version;
  }
  if (!dependencies.next || !dependencies.react) throw new Error(`unexpected runtime deps: ${JSON.stringify(dependencies)}`);

  say(`staging ${out}`);
  fs.rmSync(out, { recursive: true, force: true });
  const app = path.join(out, "app");
  const SKIP = new Set(["node_modules", "data", ".git", ".env", "dist-npm", "tsconfig.tsbuildinfo"]);
  fs.cpSync(standalone, app, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(standalone, p);
      if (!rel) return true;
      const first = rel.split(path.sep)[0];
      return !SKIP.has(first) && !first.startsWith(".env");
    },
  });
  fs.cpSync(path.join(src, ".next", "static"), path.join(app, ".next", "static"), { recursive: true });
  fs.cpSync(path.join(src, "public"), path.join(app, "public"), { recursive: true });
  fs.cpSync(path.join(src, "data.example"), path.join(app, "data.example"), { recursive: true });
  fs.cpSync(path.join(src, "npm", "bin"), path.join(out, "bin"), { recursive: true });
  fs.chmodSync(path.join(out, "bin", "bosun-x-dashboard.mjs"), 0o755);
  fs.copyFileSync(path.join(src, "npm", "README.md"), path.join(out, "README.md"));
  fs.copyFileSync(path.join(src, "LICENSE"), path.join(out, "LICENSE"));

  const pkg = {
    name: "bosun-x-dashboard",
    version: appPkg.version,
    description:
      "The bosun-x dashboard: every project, task board, handoff, server and backup your AI agents touch, on one self-hosted page. Plain files underneath.",
    license: "MIT",
    homepage: "https://x-hakt.com/locker/bosun-x",
    repository: { type: "git", url: "git+https://github.com/x-hakt/bosun-x-dashboard.git" },
    bugs: "https://github.com/x-hakt/bosun-x-dashboard/issues",
    keywords: ["dashboard", "ai-agents", "claude-code", "codex", "handoff", "self-hosted", "docker", "homelab", "project-tracking"],
    type: "module",
    bin: { "bosun-x-dashboard": "bin/bosun-x-dashboard.mjs" },
    files: ["bin/", "app/", "README.md", "LICENSE"],
    engines: { node: ">=20" },
    dependencies,
  };
  fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // Guards: nothing operator-specific or secret may ship.
  const problems = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(out, p);
      if (e.isDirectory()) {
        if (e.name === "node_modules") problems.push(`${rel}: node_modules must not ship`);
        if (rel === path.join("app", "data")) problems.push(`${rel}: a data/ folder must not ship`);
        walk(p);
      } else if (/^\.env(?!\.example$)/.test(e.name) || e.name.endsWith(".pem")) problems.push(`${rel}: secret-looking file`);
    }
  };
  walk(out);
  if (!fs.existsSync(path.join(app, "server.js"))) problems.push("app/server.js missing");
  if (problems.length) throw new Error(`refusing to stage:\n  ${problems.join("\n  ")}`);

  const size = execFileSync("du", ["-sh", out], { encoding: "utf8" }).split("\t")[0];
  say(`ok: bosun-x-dashboard@${pkg.version}, ${size} unpacked, deps ${JSON.stringify(dependencies)}`);

  if (process.argv.includes("--pack")) {
    run("npm", ["pack", "--pack-destination", root], out);
  } else {
    console.log(`\nNext: inspect ${path.relative(process.cwd(), out) || "."}, then \`npm publish ./dist-npm\` (or --pack for a .tgz).`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
