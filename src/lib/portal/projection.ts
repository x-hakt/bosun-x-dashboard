// ── The portal data chokepoint (CGB-2.1) ─────────────────────────────────────
// EVERYTHING the client portal renders comes through this module, and this is the
// ONLY file under src/lib/portal that is allowed to import from src/lib/data
// (enforced by an eslint no-restricted-imports rule — see eslint.config.mjs).
//
// Two gates, both default-closed, over the one shared bosun-x data store:
//   Gate 1  project.portals includes the portal slug        → "this is <business> work"
//   Gate 2  project.shared_with includes the client slug    → "this client may see it"
// The operator viewer clears Gate 2 automatically (sees everything in the portal).
//
// The projected shapes below are built field-by-field from a whitelist — a full
// Project/PlanningTask object is never spread through, so host/path/repo/container/
// notes/handoff can't leak even if a new operator-only field is added upstream.

import path from "node:path";
import { listProjects, getProject } from "@/lib/data/projects";
import { loadTasks } from "@/lib/data/tasks";
import { listPlanningTasks } from "@/lib/data/planning";
import { loadNotes } from "@/lib/data/notes";
import { readMarkdownIfExists } from "@/lib/data/markdown";
import { projectsDir } from "@/lib/data/paths";
import { taskKey, taskPrefix } from "@/lib/data/task-key";
import type { ProjectStage, PlanningTaskStatus } from "@/lib/types";
import type { TaskStatus } from "@/lib/data/tasks-schema";
import { passesGates, canSeeSharedTask, type PortalViewer } from "./gates";

export type { PortalViewer };

export interface PortalProjectSummary {
  slug: string;
  name: string;
  status?: string;
  stage: ProjectStage;
  updated?: string;
}

export interface PortalTaskView {
  key?: string;
  title: string;
  status: TaskStatus;
  /** The task description/thread — only present when the task itself is shared. */
  detail?: string;
  /** Opaque reply handle — only present when the task thread is shared with this
   * client, i.e. exactly when `detail` is. The portal posts task replies against it. */
  id?: string;
}

export interface PortalProjectDetail extends PortalProjectSummary {
  /** Operator-authored, client-facing prose: projects/<slug>/PORTAL.md. Optional. */
  summary?: string;
  tasks: PortalTaskView[];
}

export interface PortalIdeaView {
  id: string;
  title: string;
  status: PlanningTaskStatus;
  updated?: string;
  /** NOTES.md, shared verbatim in cut 1 (read-only). */
  thread?: string;
}

export interface PortalNoteView {
  title: string;
  body?: string;
  updated?: string;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function listPortalProjects(
  portalSlug: string,
  viewer: PortalViewer,
): Promise<PortalProjectSummary[]> {
  const projects = await listProjects();
  return projects
    .filter((p) => passesGates(p.meta.portals, p.meta.shared_with, viewer, portalSlug))
    .map((p) => ({
      slug: p.meta.slug,
      name: p.meta.display_name || p.meta.name,
      status: p.meta.status,
      stage: p.meta.stage,
      updated: p.meta.updated,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPortalProject(
  portalSlug: string,
  viewer: PortalViewer,
  slug: string,
): Promise<PortalProjectDetail | null> {
  const project = await getProject(slug);
  if (!project) return null;
  if (!passesGates(project.meta.portals, project.meta.shared_with, viewer, portalSlug)) return null;

  const prefix = taskPrefix(project.meta);
  const allTasks = await loadTasks(slug);
  const tasks: PortalTaskView[] = allTasks.map((t) => {
    const taskShared = canSeeSharedTask(
      project.meta.portals,
      project.meta.shared_with,
      t.shared_with ?? undefined,
      viewer,
      portalSlug,
    );
    return {
      key: taskKey(prefix, t.num),
      title: t.title,
      status: t.status,
      detail: taskShared ? t.description ?? undefined : undefined,
      id: taskShared ? t.id : undefined,
    };
  });

  const summary = await readMarkdownIfExists(path.join(projectsDir(), slug, "PORTAL.md"));

  return {
    slug: project.meta.slug,
    name: project.meta.display_name || project.meta.name,
    status: project.meta.status,
    stage: project.meta.stage,
    updated: project.meta.updated,
    summary: summary ?? undefined,
    tasks,
  };
}

// ── Planning ideas ───────────────────────────────────────────────────────────

export async function listPortalIdeas(portalSlug: string, viewer: PortalViewer): Promise<PortalIdeaView[]> {
  const tasks = await listPlanningTasks();
  return tasks
    .filter((t) => passesGates(t.meta.portals, t.meta.shared_with, viewer, portalSlug))
    .map((t) => ({
      id: t.meta.id,
      title: t.meta.title,
      status: t.meta.status,
      updated: t.meta.updated,
      thread: t.notes || undefined,
    }))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

export async function getPortalIdea(
  portalSlug: string,
  viewer: PortalViewer,
  id: string,
): Promise<PortalIdeaView | null> {
  const ideas = await listPortalIdeas(portalSlug, viewer);
  return ideas.find((i) => i.id === id) ?? null;
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function listPortalNotes(portalSlug: string, viewer: PortalViewer): Promise<PortalNoteView[]> {
  const notes = await loadNotes();
  return notes
    .filter((n) => passesGates(n.portals ?? undefined, n.shared_with ?? undefined, viewer, portalSlug))
    .map((n) => ({ title: n.title, body: n.body ?? undefined, updated: n.updated }))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}
