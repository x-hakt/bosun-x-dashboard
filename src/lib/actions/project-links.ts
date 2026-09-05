"use server";

import { revalidatePath } from "next/cache";
import { patchProjectYaml } from "@/lib/data/projects";

// CGB-13: the project Links card, editable — each link carries its own
// "show in portal" flag (see ProjectLink.portal in schema.ts).
export interface ProjectLinkInput {
  label: string;
  url: string;
  portal: boolean;
}

export async function saveProjectLinks(slug: string, links: ProjectLinkInput[]): Promise<void> {
  const clean = links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim(), portal: Boolean(l.portal) }))
    .filter((l) => l.label && l.url)
    .map((l) => (l.portal ? l : { label: l.label, url: l.url }));

  await patchProjectYaml(slug, { links: clean.length ? clean : null });
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
}
