"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { writePlanningTaskYaml, createPlanningTask, listPlanningTasks } from "@/lib/data/planning";
import { planningDir } from "@/lib/data/paths";

const PLANNING_ID = /^IDEA-\d+(\.\d+)*$/;

export async function updatePlanningStatus(id: string, status: string): Promise<void> {
  await writePlanningTaskYaml(id, { status });
}

export async function savePlanningNotes(id: string, content: string): Promise<void> {
  await fs.writeFile(path.join(planningDir(), id, "NOTES.md"), content, "utf-8");
}

export async function createIdea(title: string, parent?: string): Promise<string> {
  return createPlanningTask(title, parent, "idea");
}

export async function createNote(title: string): Promise<string> {
  return createPlanningTask(title, undefined, "note");
}

// Deletes a planning item and every descendant (a sub-idea can itself have
// sub-ideas). Returns the ids that were removed. The parent id, if any, is a
// convenient redirect target for the caller.
export async function deletePlanningTask(id: string): Promise<{ removed: string[]; parent?: string }> {
  if (!PLANNING_ID.test(id)) throw new Error(`invalid planning id: ${id}`);

  const tasks = await listPlanningTasks();
  const self = tasks.find((t) => t.meta.id === id);

  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (t.meta.parent && removed.has(t.meta.parent) && !removed.has(t.meta.id)) {
        removed.add(t.meta.id);
        changed = true;
      }
    }
  }

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
  await writePlanningTaskYaml(id, { status: "graduated", graduated_project: projectSlug });
}

// Lets the graduated_project link be set/corrected independent of the status dropdown
// (e.g. status was already flipped to "graduated" by hand, and the slug just needs
// recording, or needs correcting later).
export async function setGraduatedProject(id: string, slug: string): Promise<void> {
  await writePlanningTaskYaml(id, { graduated_project: slug || null });
}
