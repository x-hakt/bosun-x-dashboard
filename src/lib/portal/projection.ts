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
import { readPortalSeenAt } from "@/lib/portal-seen-store";
import { readClientThread } from "@/lib/data/portal-messages";
import { parseNoteThread } from "@/lib/notes-thread";

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
  /** The task's thread, if it has one. */
  detail?: string;
  /** Opaque reply handle the portal posts task replies against. */
  id: string;
}

export interface PortalProjectDetail extends PortalProjectSummary {
  /** Operator-authored, client-facing prose: projects/<slug>/PORTAL.md. Optional. */
  summary?: string;
  /** Tech stack tags — low sensitivity, shown for any Gate-1/2 shared project. */
  tags: string[];
  /** CGB-13: only the links the operator flagged `portal: true` — the project's
   * other links (an admin panel, an internal monitoring URL) stay out. */
  links: { label: string; url: string }[];
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

  // A task's TITLE is gated the same as its detail, not just its thread — a
  // shared project does not imply every task on it is fit for a client to see
  // (bug/fault tasks especially). Only tasks the operator explicitly listed in
  // this task's own `shared_with` show up at all (an operator viewer sees
  // every task, same as everywhere else — canSeeSharedTask always passes them).
  const prefix = taskPrefix(project.meta);
  const allTasks = await loadTasks(slug);
  const tasks: PortalTaskView[] = allTasks
    .filter((t) =>
      canSeeSharedTask(project.meta.portals, project.meta.shared_with, t.shared_with ?? undefined, viewer, portalSlug),
    )
    .map((t) => ({
      key: taskKey(prefix, t.num),
      title: t.title,
      status: t.status,
      detail: t.description ?? undefined,
      id: t.id,
    }));

  const summary = await readMarkdownIfExists(path.join(projectsDir(), slug, "PORTAL.md"));

  return {
    slug: project.meta.slug,
    name: project.meta.display_name || project.meta.name,
    status: project.meta.status,
    stage: project.meta.stage,
    updated: project.meta.updated,
    summary: summary ?? undefined,
    tags: project.meta.tags ?? [],
    links: (project.meta.links ?? []).filter((l) => l.portal).map((l) => ({ label: l.label, url: l.url })),
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

// ── Direct client<->operator messages (CGB-10) ───────────────────────────────

export interface PortalMessageThread {
  thread?: string;
}

// A client's own message thread — only ever their own; there's no gate to check
// beyond "signed in as this client" since every invited client has exactly one.
export async function getPortalMessages(viewer: PortalViewer): Promise<PortalMessageThread> {
  if (viewer.kind !== "client") return {};
  const { notes } = await readClientThread(viewer.slug);
  return { thread: notes || undefined };
}

// ── "Since your last visit" digest (CGB-9) ───────────────────────────────────

export interface PortalDigest {
  /** ISO timestamp the digest is measured from (this client's previous visit). */
  since?: string;
  /** true on a client's very first visit — nothing to diff against, show nothing. */
  firstVisit: boolean;
  projects: { slug: string; name: string; updated?: string }[];
  ideas: { id: string; title: string; updated?: string }[];
  notes: { title: string; updated?: string }[];
  /** A new operator message landed on the client's message thread (CGB-10). */
  newMessage: boolean;
}

// What changed among a client's shared items since they last opened the portal.
// Uses each item's `updated` stamp (idea threads bump it on every reply, projects
// on any edit). Operators get an empty digest — the nudge is a client feature.
export async function getPortalDigest(portalSlug: string, viewer: PortalViewer): Promise<PortalDigest> {
  const empty = { firstVisit: false, projects: [], ideas: [], notes: [], newMessage: false };
  if (viewer.kind !== "client") return empty;

  const since = await readPortalSeenAt(viewer.slug);
  if (!since) return { ...empty, firstVisit: true };

  const sinceMs = Date.parse(since);
  const isNewer = (updated?: string) => {
    if (!updated) return false;
    const ms = Date.parse(updated);
    return Number.isFinite(ms) && ms > sinceMs;
  };

  const [projects, ideas, notes, messages] = await Promise.all([
    listPortalProjects(portalSlug, viewer),
    listPortalIdeas(portalSlug, viewer),
    listPortalNotes(portalSlug, viewer),
    readClientThread(viewer.slug),
  ]);

  // "New message" = the thread changed since the client's last visit AND the
  // most recent turn isn't one of their own (they don't need to be told about
  // their own message).
  const lastTurn = parseNoteThread(messages.notes).at(-1);
  const newMessage = isNewer(messages.updatedAt) && Boolean(lastTurn) && lastTurn!.role !== "client";

  return {
    since,
    firstVisit: false,
    projects: projects.filter((p) => isNewer(p.updated)).map((p) => ({ slug: p.slug, name: p.name, updated: p.updated })),
    ideas: ideas.filter((i) => isNewer(i.updated)).map((i) => ({ id: i.id, title: i.title, updated: i.updated })),
    notes: notes.filter((n) => isNewer(n.updated)).map((n) => ({ title: n.title, updated: n.updated })),
    newMessage,
  };
}
