import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { projectsDir } from "./paths";
import { TasksFileSchema, type Task } from "./tasks-schema";
import { countClientReplies } from "@/lib/notes-thread";

function tasksFile(slug: string): string {
  return path.join(projectsDir(), slug, "tasks.yml");
}

// Full file including the `seq` counter — use when creating tasks (which needs to
// advance seq) or when the exact next number matters.
export async function loadTasksFile(slug: string): Promise<{ seq: number; tasks: Task[] }> {
  let raw: string;
  try {
    raw = await fs.readFile(tasksFile(slug), "utf-8");
  } catch {
    return { seq: 0, tasks: [] };
  }
  const parsed = TasksFileSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return { seq: 0, tasks: [] };
  // Defend against a hand-edited file whose seq fell behind the numbers actually in use.
  const maxNum = parsed.data.tasks.reduce((max, task) => Math.max(max, task.num ?? 0), 0);
  return { seq: Math.max(parsed.data.seq, maxNum), tasks: parsed.data.tasks };
}

export async function loadTasks(slug: string): Promise<Task[]> {
  return (await loadTasksFile(slug)).tasks;
}

export async function saveTasks(slug: string, tasks: Task[], seq: number): Promise<void> {
  const yamlContent = dumpYaml({ seq, tasks });
  await fs.writeFile(tasksFile(slug), yamlContent, "utf-8");
}

// CGB-6/CGB-8: how many portal-client turns on this task's thread the operator
// hasn't marked reviewed yet.
export function taskClientReplyUnseen(task: Task): number {
  const total = countClientReplies(task.description ?? "");
  return Math.max(0, total - (task.client_replies_seen ?? 0));
}

// Total unreviewed client replies across every project's tasks — for the overview tile.
export async function unseenClientRepliesInTasks(slugs: string[]): Promise<number> {
  const perProject = await Promise.all(
    slugs.map(async (slug) => (await loadTasks(slug)).reduce((n, t) => n + taskClientReplyUnseen(t), 0)),
  );
  return perProject.reduce((a, b) => a + b, 0);
}
