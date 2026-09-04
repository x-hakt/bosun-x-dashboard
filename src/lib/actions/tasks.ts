"use server";

import { randomUUID } from "node:crypto";
import { loadTasksFile, saveTasks } from "@/lib/data/tasks";
import type { Task, TaskStatus } from "@/lib/data/tasks-schema";
import { isoTimestamp } from "@/lib/time/stamp";
import { syncStatusBoardForProject } from "@/lib/data/status-board";
import { countClientReplies } from "@/lib/notes-thread";

export async function createTask(slug: string, title: string, description: string, parentId?: string): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  if (parentId && !tasks.some((task) => task.id === parentId)) throw new Error("Parent task not found");
  const now = isoTimestamp();
  const nextSeq = seq + 1;
  const task: Task = {
    id: randomUUID(),
    num: nextSeq,
    title,
    description: description || undefined,
    status: "backlog",
    parent_id: parentId,
    depends_on: [],
    created: now,
    updated: now,
  };
  await saveTasks(slug, [...tasks, task], nextSeq);
  await syncStatusBoardForProject(slug);
}

export async function updateTask(
  slug: string,
  taskId: string,
  input: { title: string; description: string; dependsOn: string[] },
): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("Task not found");

  const validIds = new Set(tasks.map((item) => item.id));
  const dependencies = [...new Set(input.dependsOn)].filter((id) => id !== taskId && validIds.has(id));
  const dependencyMap = new Map(tasks.map((item) => [item.id, item.id === taskId ? dependencies : item.depends_on ?? []]));

  function reaches(start: string, target: string, seen = new Set<string>()): boolean {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return (dependencyMap.get(start) ?? []).some((next) => reaches(next, target, seen));
  }
  if (dependencies.some((dependency) => reaches(dependency, taskId))) {
    throw new Error("That dependency would create a cycle");
  }

  const now = isoTimestamp();
  const next = tasks.map((item) => item.id === taskId ? {
    ...item,
    title: input.title.trim() || item.title,
    description: input.description.trim() || undefined,
    depends_on: dependencies,
    updated: now,
  } : item);
  await saveTasks(slug, next, seq);
  await syncStatusBoardForProject(slug);
}

// Description-only edit — used by the conversation-thread view, which owns the
// description independently of the title/dependencies form.
export async function updateTaskDescription(slug: string, taskId: string, description: string): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  if (!tasks.some((task) => task.id === taskId)) throw new Error("Task not found");
  const now = isoTimestamp();
  const next = tasks.map((task) =>
    task.id === taskId ? { ...task, description: description.trim() || undefined, updated: now } : task,
  );
  await saveTasks(slug, next, seq);
  await syncStatusBoardForProject(slug);
}

// CGB-8: operator acknowledges the portal-client replies on a task thread — pins
// the seen count to the current client-reply count so the nudge clears.
export async function markTaskClientRepliesReviewed(slug: string, taskId: string): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  const target = tasks.find((t) => t.id === taskId);
  if (!target) throw new Error("Task not found");
  const seen = countClientReplies(target.description ?? "");
  const next = tasks.map((t) => (t.id === taskId ? { ...t, client_replies_seen: seen } : t));
  await saveTasks(slug, next, seq);
}

export async function updateTaskStatus(slug: string, taskId: string, status: TaskStatus): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  const now = isoTimestamp();
  const next = tasks.map((t) => (t.id === taskId ? { ...t, status, updated: now } : t));
  await saveTasks(slug, next, seq);
  await syncStatusBoardForProject(slug);
}

export async function deleteTask(slug: string, taskId: string): Promise<void> {
  const { seq, tasks } = await loadTasksFile(slug);
  const removed = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.parent_id && removed.has(task.parent_id) && !removed.has(task.id)) {
        removed.add(task.id);
        changed = true;
      }
    }
  }
  await saveTasks(
    slug,
    tasks
      .filter((task) => !removed.has(task.id))
      .map((task) => ({ ...task, depends_on: (task.depends_on ?? []).filter((id) => !removed.has(id)) })),
    seq,
  );
  await syncStatusBoardForProject(slug);
}
