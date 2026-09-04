"use server";

// The third audited boundary (with projection.ts, auth.ts) — the ONLY portal
// write path. A signed-in client appends a message to an idea thread that is
// shared with them. The share gate is re-checked here against clients.yml
// before anything is written; the operator's own replies go through the
// operator UI, not this.

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getPlanningTask } from "@/lib/data/planning";
import { planningDir } from "@/lib/data/paths";
import { getClient } from "@/lib/data/clients";
import { noteTurnHeader } from "@/lib/data/notes-thread";
import { isoTimestamp } from "@/lib/time/stamp";
import { passesGates } from "./gates";
import { getPortalViewer } from "./auth";
import { PORTAL_SLUG } from "./mode";

const MAX = 8_000;

export async function postPortalIdeaReply(ideaId: string, text: string): Promise<void> {
  const viewer = await getPortalViewer();
  if (!viewer || viewer.kind !== "client") throw new Error("Sign in as a client to reply.");

  const body = text.trim();
  if (!body) throw new Error("Nothing to post.");
  if (body.length > MAX) throw new Error(`Keep it under ${MAX} characters.`);
  if (!/^IDEA-\d+(\.\d+)*$/.test(ideaId)) throw new Error("Bad idea id.");

  const task = await getPlanningTask(ideaId);
  if (!task) throw new Error("Not found.");
  if (!passesGates(task.meta.portals ?? undefined, task.meta.shared_with ?? undefined, viewer, PORTAL_SLUG)) {
    throw new Error("This thread isn't shared with you.");
  }

  const client = await getClient(viewer.slug);
  const header = noteTurnHeader(client?.name ?? viewer.slug, isoTimestamp().slice(0, 10), "client reply");
  const card = `\n\n${header}\n\n${body}\n`;

  const file = path.join(planningDir(), ideaId, "NOTES.md");
  const current = await fs.readFile(file, "utf-8").catch(() => "");
  await fs.writeFile(file, current + card, "utf-8");
  revalidatePath(`/c/ideas/${ideaId}`);
}
