import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { projectsDir } from "./paths";
import { loadTasks } from "./tasks";
import { deriveTaskPrefix } from "./task-key";
import type { Task } from "./tasks-schema";

// Keeps the "Task board" block in projects/<slug>/STATUS.md in step with tasks.yml, so
// the file always shows real task state without anyone hand-editing it. Called from the
// task server actions (create/update/status/delete). The bosun-x package (lib/board.mjs)
// is the mirror used by the handoff CLI — the two renderers must stay in sync, so the
// markers and body format here must match bosun-x's; the format changes ~never.

const START = "<!-- bosun:task-board:start -->";
const END = "<!-- bosun:task-board:end -->";
const SHIPPED_KEYS_SHOWN = 12;

function clipTitle(title: string): string {
  const value = String(title || "").replace(/\s+/g, " ").trim();
  return value.length > 90 ? `${value.slice(0, 89).trimEnd()}…` : value;
}

export function renderBoardBody(tasks: Task[], prefix: string, stamp: string): string {
  const asc = (a: Task, b: Task) => (a.num ?? 0) - (b.num ?? 0);
  const desc = (a: Task, b: Task) => (b.num ?? 0) - (a.num ?? 0);
  // Queues read oldest-first (do-next order); shipped reads newest-first.
  const of = (status: string) => tasks.filter((task) => task.status === status).sort(status === "done" ? desc : asc);
  const line = (task: Task) => `- ${prefix}-${task.num} — ${clipTitle(task.title)}`;
  const keys = (list: Task[]) => list.map((task) => `${prefix}-${task.num}`).join(", ");

  const inProgress = of("in_progress");
  const upNext = of("todo");
  const backlog = of("backlog");
  const shipped = of("done");

  const out: string[] = ["## Task board", "", `_Generated from tasks.yml · ${stamp}_`, ""];
  out.push("**In progress**");
  out.push(...(inProgress.length ? inProgress.map(line) : ["- _nothing in progress_"]));
  out.push("");
  if (upNext.length) out.push("**Up next**", ...upNext.map(line), "");
  if (backlog.length) out.push(`**Backlog** (${backlog.length}) — ${keys(backlog)}`, "");
  if (shipped.length) {
    const shown = keys(shipped.slice(0, SHIPPED_KEYS_SHOWN));
    const more = shipped.length > SHIPPED_KEYS_SHOWN ? ` … +${shipped.length - SHIPPED_KEYS_SHOWN} earlier` : "";
    out.push(`**Shipped** (${shipped.length}) — ${shown}${more}`, "");
  }
  return out.join("\n").trimEnd();
}

const withoutStamp = (body: string) => body.replace(/^_Generated from tasks\.yml · .*_$/m, "").trim();

function spliceBlock(statusMd: string, block: string): string {
  const s = statusMd.indexOf(START);
  const e = statusMd.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    const before = statusMd.slice(0, s).trimEnd();
    const after = statusMd.slice(e + END.length).trimStart();
    return `${before}\n\n${block}\n${after ? `\n${after}` : ""}`.trimEnd() + "\n";
  }
  const base = statusMd.trim() ? statusMd.trimEnd() : "# Status";
  return `${base}\n\n${block}\n`;
}

// Regenerates the STATUS.md board for one project. Only writes when the task content
// actually changed (the timestamp line alone never triggers a write).
async function prefixFor(slug: string): Promise<string> {
  try {
    const meta = loadYaml(await fs.readFile(path.join(projectsDir(), slug, "project.yml"), "utf-8")) as
      | { key?: string }
      | undefined;
    if (meta?.key && String(meta.key).trim()) return String(meta.key).trim().toUpperCase();
  } catch {
    // fall through to the derived prefix
  }
  return deriveTaskPrefix(slug);
}

export async function syncStatusBoardForProject(slug: string): Promise<void> {
  const [tasks, prefix] = await Promise.all([loadTasks(slug), prefixFor(slug)]);
  const stamp = new Date().toISOString();
  const body = renderBoardBody(tasks, prefix, stamp);
  const block = `${START}\n\n${body}\n\n${END}`;

  const file = path.join(projectsDir(), slug, "STATUS.md");
  let current = "";
  try {
    current = await fs.readFile(file, "utf-8");
  } catch {
    // seeded by spliceBlock
  }
  const existing = current.match(new RegExp(`${START}\\n\\n([\\s\\S]*?)\\n\\n${END}`));
  if (existing && withoutStamp(existing[1]) === withoutStamp(body)) return;

  await fs.writeFile(file, spliceBlock(current, block), "utf-8");
}
