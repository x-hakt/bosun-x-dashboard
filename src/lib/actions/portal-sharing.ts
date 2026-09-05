"use server";

import { revalidatePath } from "next/cache";
import { patchProjectYaml } from "@/lib/data/projects";
import { writePlanningTaskYaml } from "@/lib/data/planning";
import { updateNote } from "@/lib/actions/notes";
import { loadClientRegistry } from "@/lib/data/clients";

// Operator-side "share with…" writes. Sets the two gate fields (portals[],
// shared_with[]) on a project / planning idea / note. Both are validated against
// clients.yml — an unknown portal or a client whose portal isn't selected is
// dropped — so the portal projection can trust what it reads.

export interface SharingInput {
  portals: string[];
  shared_with: string[];
}

async function normalize(input: SharingInput): Promise<{ portals: string[] | null; shared_with: string[] | null }> {
  const reg = await loadClientRegistry();
  const knownPortals = new Set(reg.portals.map((p) => p.slug));
  const portals = [...new Set(input.portals)].filter((p) => knownPortals.has(p));

  const clientsInScope = new Set(reg.clients.filter((c) => portals.includes(c.portal)).map((c) => c.slug));
  const shared_with = [...new Set(input.shared_with)].filter((c) => clientsInScope.has(c));

  return {
    portals: portals.length ? portals : null,
    shared_with: shared_with.length ? shared_with : null,
  };
}

export async function setProjectSharing(slug: string, input: SharingInput): Promise<void> {
  await patchProjectYaml(slug, await normalize(input));
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
}

export async function setPlanningSharing(id: string, input: SharingInput): Promise<void> {
  await writePlanningTaskYaml(id, await normalize(input));
  revalidatePath(`/planning/${id}`);
  revalidatePath("/planning");
}

export async function setNoteSharing(id: string, input: SharingInput): Promise<void> {
  const { portals, shared_with } = await normalize(input);
  await updateNote(id, { portals: portals ?? [], shared_with: shared_with ?? [] });
  revalidatePath("/notes");
}

// CGB-14: what an individual task on this project defaults to when it carries
// no `shared_with` of its own. "none" (hidden) is the original CGB-8
// behaviour; "all" shows every task to every client the project is shared
// with unless a task explicitly overrides it (see setTaskSharing).
export async function setTaskSharingDefault(slug: string, mode: "all" | "none"): Promise<void> {
  await patchProjectYaml(slug, { task_sharing_default: mode === "none" ? null : mode });
  revalidatePath(`/projects/${slug}`);
}
