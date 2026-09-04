"use server";

// The third audited boundary (with projection.ts, auth.ts) — the ONLY portal
// write path. A signed-in client appends a turn to a thread that is shared with
// them: a planning idea's NOTES.md, or a project task's description. Every gate
// is re-checked here against clients.yml before anything is written; the
// operator's own replies go through the operator UI, not this.

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getPlanningTask } from "@/lib/data/planning";
import { getProject } from "@/lib/data/projects";
import { loadTasksFile, saveTasks } from "@/lib/data/tasks";
import { appendClientThreadTurn } from "@/lib/data/portal-messages";
import { planningDir } from "@/lib/data/paths";
import { getClient } from "@/lib/data/clients";
import { noteTurnHeader } from "@/lib/notes-thread";
import { isoTimestamp, dateStamp } from "@/lib/time/stamp";
import { writePortalSeenAt } from "@/lib/portal-seen-store";
import { passesGates, canSeeSharedTask } from "./gates";
import { getPortalViewer } from "./auth";
import { PORTAL_SLUG } from "./mode";

const MAX = 8_000;
const IDEA_ID = /^IDEA-\d+(\.\d+)*$/;
const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// A canned sign-off turn — the "approve / acknowledge" action is just a reply
// with a fixed body and its own label so the operator can tell it apart.
const SIGNOFF_LABEL = "client sign-off";
const SIGNOFF_BODY = "**Signed off — looks good to me.** ✅";

type Client = { slug: string };

async function requireClient(): Promise<Client> {
  const viewer = await getPortalViewer();
  if (!viewer || viewer.kind !== "client") throw new Error("Sign in as a client to reply.");
  return viewer;
}

function cleanBody(text: string): string {
  const body = text.trim();
  if (!body) throw new Error("Nothing to post.");
  if (body.length > MAX) throw new Error(`Keep it under ${MAX} characters.`);
  return body;
}

async function turnCard(clientSlug: string, label: string, body: string): Promise<string> {
  const client = await getClient(clientSlug);
  const header = noteTurnHeader(client?.name ?? clientSlug, isoTimestamp().slice(0, 10), label);
  return `\n\n${header}\n\n${body}\n`;
}

// ── Planning idea threads (NOTES.md) ─────────────────────────────────────────

async function appendToIdea(ideaId: string, clientSlug: string, label: string, body: string): Promise<void> {
  if (!IDEA_ID.test(ideaId)) throw new Error("Bad idea id.");
  const task = await getPlanningTask(ideaId);
  if (!task) throw new Error("Not found.");
  const viewer: { kind: "client"; slug: string } = { kind: "client", slug: clientSlug };
  if (!passesGates(task.meta.portals ?? undefined, task.meta.shared_with ?? undefined, viewer, PORTAL_SLUG)) {
    throw new Error("This thread isn't shared with you.");
  }
  const file = path.join(planningDir(), ideaId, "NOTES.md");
  const current = await fs.readFile(file, "utf-8").catch(() => "");
  await fs.writeFile(file, current + (await turnCard(clientSlug, label, body)), "utf-8");
  revalidatePath(`/c/ideas/${ideaId}`);
}

export async function postPortalIdeaReply(ideaId: string, text: string): Promise<void> {
  const { slug } = await requireClient();
  await appendToIdea(ideaId, slug, "client reply", cleanBody(text));
}

export async function acknowledgePortalIdea(ideaId: string): Promise<void> {
  const { slug } = await requireClient();
  await appendToIdea(ideaId, slug, SIGNOFF_LABEL, SIGNOFF_BODY);
}

// ── Project task threads (tasks.yml description) ─────────────────────────────

async function appendToTask(
  projectSlug: string,
  taskId: string,
  clientSlug: string,
  label: string,
  body: string,
): Promise<void> {
  if (!PROJECT_SLUG.test(projectSlug) || !TASK_ID.test(taskId)) throw new Error("Bad task reference.");
  const project = await getProject(projectSlug);
  if (!project) throw new Error("Not found.");

  const { seq, tasks } = await loadTasksFile(projectSlug);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Not found.");

  const viewer: { kind: "client"; slug: string } = { kind: "client", slug: clientSlug };
  if (
    !canSeeSharedTask(
      project.meta.portals,
      project.meta.shared_with,
      task.shared_with ?? undefined,
      viewer,
      PORTAL_SLUG,
    )
  ) {
    throw new Error("This thread isn't shared with you.");
  }

  const card = await turnCard(clientSlug, label, body);
  const next = tasks.map((t) =>
    t.id === taskId ? { ...t, description: `${(t.description ?? "").trimEnd()}${card}`, updated: dateStamp() } : t,
  );
  await saveTasks(projectSlug, next, seq);
  revalidatePath(`/c/projects/${projectSlug}`);
}

export async function postPortalTaskReply(projectSlug: string, taskId: string, text: string): Promise<void> {
  const { slug } = await requireClient();
  await appendToTask(projectSlug, taskId, slug, "client reply", cleanBody(text));
}

export async function acknowledgePortalTask(projectSlug: string, taskId: string): Promise<void> {
  const { slug } = await requireClient();
  await appendToTask(projectSlug, taskId, slug, SIGNOFF_LABEL, SIGNOFF_BODY);
}

// ── Direct client<->operator messages (CGB-10) ───────────────────────────────
// A general, always-on thread per client — not tied to any project/idea/task.
// No gate to check beyond "is a signed-in client" — every invited client has one.

export async function postPortalMessage(text: string): Promise<void> {
  const { slug } = await requireClient();
  const card = await turnCard(slug, "client message", cleanBody(text));
  await appendClientThreadTurn(slug, card);
  revalidatePath("/c/messages");
  revalidatePath("/messages");
}

// ── "Since your last visit" digest (CGB-9) ───────────────────────────────────

// Stamp this client's visit — called by a beacon on the portal home page after
// the digest for the *previous* visit has rendered. No-op for operators.
export async function markPortalSeen(): Promise<void> {
  const viewer = await getPortalViewer();
  if (!viewer || viewer.kind !== "client") return;
  await writePortalSeenAt(viewer.slug, isoTimestamp());
}
