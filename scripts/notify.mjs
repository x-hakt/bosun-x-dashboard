#!/usr/bin/env node
// BXD-99: raise / resolve / list dashboard notifications from a script, a cron job or an
// agent. They show in the Overview "Needs you" list and as a badge on Overview.
//
//   npm run notify -- raise --key planner:x-hakt-topics --title "Pick this week's x-hakt topics" \
//        [--body "..."] [--href https://planner.x-hakt.com/launches] [--level info|warn|urgent] [--source planner]
//   npm run notify -- resolve --key planner:x-hakt-topics
//   npm run notify -- list [--all] [--json]
//
// Raising the same key again updates it in place. A dismissed notification stays dismissed
// until it is raised with a different title/body/level; a resolved one comes back on the
// next raise. See docs/notifications.md.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataDir } from "./lib/data-dir.mjs";
import { raise, resolve, visible } from "../src/lib/notifications-core.mjs";
import { readNotifications, updateNotifications } from "../src/lib/notifications-store.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolveDataDir(repoRoot);

function parse(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    const name = a.slice(2);
    if (name === "all" || name === "json") opts[name] = true;
    else {
      const v = rest[++i];
      if (v === undefined) throw new Error(`--${name} needs a value`);
      opts[name] = v;
    }
  }
  return { cmd, opts };
}

async function main() {
  const { cmd, opts } = parse(process.argv.slice(2));
  if (cmd === "raise") {
    if (!opts.key || !opts.title) throw new Error("raise needs --key and --title");
    const now = new Date();
    const { notification, change } = await updateNotifications(dataDir, (file) =>
      raise(file, { key: opts.key, title: opts.title, body: opts.body, href: opts.href, level: opts.level, source: opts.source }, now), now);
    console.log(`${change} ${notification.id} [${notification.level}] ${notification.key}: ${notification.title}`);
  } else if (cmd === "resolve") {
    if (!opts.key) throw new Error("resolve needs --key");
    const { found } = await updateNotifications(dataDir, (file) => resolve(file, opts.key, new Date()));
    console.log(found ? `resolved ${opts.key}` : `nothing open for ${opts.key}`);
  } else if (cmd === "list") {
    const file = await readNotifications(dataDir);
    const list = opts.all ? file.notifications : visible(file, new Date());
    if (opts.json) console.log(JSON.stringify(list, null, 2));
    else if (!list.length) console.log("nothing needs you");
    else for (const n of list) console.log(`${n.id} [${n.level}]${opts.all ? ` (${n.state})` : ""} ${n.key}: ${n.title}${n.href ? ` -> ${n.href}` : ""}`);
  } else {
    throw new Error("usage: notify raise|resolve|list (see the header of scripts/notify.mjs)");
  }
}

main().catch((err) => {
  console.error(`notify: ${err.message}`);
  process.exit(1);
});
