"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { writePlanningTaskYaml, createPlanningTask, listPlanningTasks, descendantIds } from "@/lib/data/planning";
import { planningDir } from "@/lib/data/paths";
import { countClientReplies } from "@/lib/notes-thread";

const PLANNING_ID = /^IDEA-\d+(\.\d+)*$/;
const STATUSES = new Set(["idea", "planning", "ready", "graduated"]);

// BXD-58: a status change carries every sub-idea (at any depth) along with it, so
// an idea moved to "ready" doesn't leave its sub-ideas stranded at "idea". A
// sub-idea can still be set on its own afterwards; only its descendants follow.
async function setStatusWithDescendants(id: string, status: string, patch: Record<string, unknown> = {}): Promise<void> {
  if (!PLANNING_ID.test(id)) throw new Error(`invalid planning id: ${id}`);
  if (!STATUSES.has(status)) throw new Error(`invalid planning status: ${status}`);
  const tasks = await listPlanningTasks();
  await writePlanningTaskYaml(id, { status, ...patch });
  for (const childId of descendantIds(tasks, id)) {
    const child = tasks.find((t) => t.meta.id === childId);
    if (!PLANNING_ID.test(childId) || child?.meta.status === status) continue;
    await writePlanningTaskYaml(childId, { status });
  }
}

export async function updatePlanningStatus(id: string, status: string): Promise<void> {
  await setStatusWithDescendants(id, status);
}

// BXD-57: rename an idea in place. The id (and its folder) never changes.
export async function renamePlanningTask(id: string, title: string): Promise<void> {
  if (!PLANNING_ID.test(id)) throw new Error(`invalid planning id: ${id}`);
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("title can't be empty");
  await writePlanningTaskYaml(id, { title: trimmed });
}

export async function savePlanningNotes(id: string, content: string): Promise<void> {
  await fs.writeFile(path.join(planningDir(), id, "NOTES.md"), content, "utf-8");
}

// CGB-6: operator acknowledges the portal-client replies on a thread — pins the
// seen count to the current client-reply count so the nudge clears.
export async function markClientRepliesReviewed(id: string): Promise<void> {
  if (!PLANNING_ID.test(id)) throw new Error(`invalid planning id: ${id}`);
  const notes = await fs
    .readFile(path.join(planningDir(), id, "NOTES.md"), "utf-8")
    .catch(() => "");
  await writePlanningTaskYaml(id, { client_replies_seen: countClientReplies(notes) });
}

export async function createIdea(title: string, parent?: string): Promise<string> {
  return createPlanningTask(title, parent);
}

// Deletes a planning item and every descendant (a sub-idea can itself have
// sub-ideas). Returns the ids that were removed. The parent id, if any, is a
// convenient redirect target for the caller.
export async function deletePlanningTask(id: string): Promise<{ removed: string[]; parent?: string }> {
  if (!PLANNING_ID.test(id)) throw new Error(`invalid planning id: ${id}`);

  const tasks = await listPlanningTasks();
  const self = tasks.find((t) => t.meta.id === id);
  const removed = new Set([id, ...descendantIds(tasks, id)]);

  for (const rid of removed) {
    if (!PLANNING_ID.test(rid)) continue;
    await fs.rm(path.join(planningDir(), rid), { recursive: true, force: true });
  }

  return { removed: [...removed], parent: self?.meta.parent };
}

// Marks a task graduated and cross-links it to the real project that was built from it.
// Does NOT scaffold the project itself (folder/git/host setup happens conversationally,
// by hand or via an agent) — this only records that the graduation happened, on the
// Planning side. The corresponding project.yml's `planning_task` field is set separately,
// by hand, when the project is created — this keeps the two records independently
// editable rather than one action needing write access to both data trees at once.
export async function markGraduated(id: string, projectSlug: string): Promise<void> {
  await setStatusWithDescendants(id, "graduated", { graduated_project: projectSlug });
}

// Lets the graduated_project link be set/corrected independent of the status dropdown
// (e.g. status was already flipped to "graduated" by hand, and the slug just needs
// recording, or needs correcting later).
export async function setGraduatedProject(id: string, slug: string): Promise<void> {
  await writePlanningTaskYaml(id, { graduated_project: slug || null });
}
