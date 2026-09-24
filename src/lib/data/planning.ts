import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { planningDir } from "./paths";
import { PlanningTaskYmlSchema } from "./schema";
import { readMarkdownIfExists } from "./markdown";
import type { PlanningTaskWithDoc } from "@/lib/types";
import { dateStamp } from "@/lib/time/stamp";
import { countClientReplies } from "@/lib/notes-thread";

function taskYmlPath(id: string): string {
  return path.join(planningDir(), id, "task.yml");
}

async function loadTaskDir(id: string): Promise<PlanningTaskWithDoc | null> {
  const dir = path.join(planningDir(), id);
  let raw: string;
  try {
    raw = await fs.readFile(taskYmlPath(id), "utf-8");
  } catch {
    return null;
  }
  const parsed = PlanningTaskYmlSchema.safeParse(loadYaml(raw));
  const notes = (await readMarkdownIfExists(path.join(dir, "NOTES.md"))) ?? "";

  if (!parsed.success) {
    return {
      meta: { id, title: id, status: "idea", type: "idea" },
      notes,
      invalid: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  return {
    meta: {
      id: parsed.data.id,
      title: parsed.data.title,
      status: parsed.data.status,
      type: parsed.data.type ?? "idea",
      parent: parsed.data.parent ?? undefined,
      graduated_project: parsed.data.graduated_project ?? undefined,
      created: parsed.data.created ?? undefined,
      updated: parsed.data.updated ?? undefined,
      portals: parsed.data.portals ?? undefined,
      shared_with: parsed.data.shared_with ?? undefined,
      client_replies_seen: parsed.data.client_replies_seen ?? undefined,
    },
    notes,
  };
}

// CGB-6: portal-client reply tally for a thread — how many the client has posted
// vs. how many the operator has marked reviewed. `unseen > 0` drives the nudge.
export function clientReplyStatus(task: PlanningTaskWithDoc): { total: number; unseen: number } {
  const total = countClientReplies(task.notes);
  const seen = task.meta.client_replies_seen ?? 0;
  return { total, unseen: Math.max(0, total - seen) };
}

export async function listPlanningTasks(): Promise<PlanningTaskWithDoc[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(planningDir(), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const tasks = await Promise.all(entries.map(loadTaskDir));
  return tasks.filter((t): t is PlanningTaskWithDoc => t !== null);
}

export async function getPlanningTask(id: string): Promise<PlanningTaskWithDoc | null> {
  return loadTaskDir(id);
}

// Scans existing ids to find the next free one — single-user/low-concurrency, so a
// simple max+1 scan is all this needs (no locking, no separate counter file).
export async function nextPlanningId(parent?: string): Promise<string> {
  const tasks = await listPlanningTasks();
  if (!parent) {
    const topLevel = tasks
      .map((t) => /^IDEA-(\d+)$/.exec(t.meta.id)?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number);
    const next = topLevel.length > 0 ? Math.max(...topLevel) + 1 : 1;
    return `IDEA-${next}`;
  }
  const prefix = `${parent}.`;
  const children = tasks
    .map((t) => (t.meta.id.startsWith(prefix) ? t.meta.id.slice(prefix.length) : undefined))
    .filter((n): n is string => n !== undefined && /^\d+$/.test(n))
    .map(Number);
  const next = children.length > 0 ? Math.max(...children) + 1 : 1;
  return `${parent}.${next}`;
}

// Agents leave research breadcrumbs as full-line `#` comments in task.yml (usually
// appended at the end). js-yaml drops comments on a round-trip, so carry every
// column-0 comment line over and re-append it after the dump. Column 0 only:
// block-scalar content is always indented, so it can't be mistaken for a comment.
function fullLineComments(raw: string): string[] {
  return raw.split("\n").filter((line) => line.startsWith("#"));
}

export async function writePlanningTaskYaml(id: string, patch: Record<string, unknown>): Promise<void> {
  const filePath = taskYmlPath(id);
  const raw = await fs.readFile(filePath, "utf-8");
  const current = (loadYaml(raw) as Record<string, unknown>) ?? {};
  const next = { ...current, updated: dateStamp(), ...patch };
  const comments = fullLineComments(raw);
  const body = dumpYaml(next) + (comments.length > 0 ? comments.join("\n") + "\n" : "");
  await fs.writeFile(filePath, body, "utf-8");
}

// Every descendant id of `id` (sub-ideas can have sub-ideas), resolved through
// `parent` links rather than id prefixes so a re-parented item still follows.
export function descendantIds(tasks: PlanningTaskWithDoc[], id: string): string[] {
  const found = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const t of tasks) {
      if (t.meta.parent && frontier.includes(t.meta.parent) && !found.has(t.meta.id) && t.meta.id !== id) {
        found.add(t.meta.id);
        next.push(t.meta.id);
      }
    }
    frontier = next;
  }
  return [...found];
}

export async function createPlanningTask(title: string, parent?: string): Promise<string> {
  const id = await nextPlanningId(parent);
  const dir = path.join(planningDir(), id);
  await fs.mkdir(dir, { recursive: true });
  const now = dateStamp();
  const yml = {
    id,
    title,
    status: "idea",
    type: "idea",
    parent: parent ?? null,
    graduated_project: null,
    created: now,
    updated: now,
  };
  await fs.writeFile(path.join(dir, "task.yml"), dumpYaml(yml), "utf-8");
  await fs.writeFile(path.join(dir, "NOTES.md"), "", "utf-8");
  return id;
}
