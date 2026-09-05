"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { patchProjectYaml, renameProjectDirectory } from "@/lib/data/projects";
import { projectsDir } from "@/lib/data/paths";

// A visible rename also moves the data directory so links, handoffs and standards use
// the same durable slug. The data helper validates both path segments and rolls back a
// directory move if the metadata write fails.
export async function renameProject(slug: string, displayName: string): Promise<string> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Project name cannot be empty.");
  return renameProjectDirectory(slug, trimmed);
}

// `status` is a free string by design (see schema.ts) — this just writes whatever's picked.
export async function updateProjectStatus(slug: string, status: string): Promise<void> {
  await patchProjectYaml(slug, { status: status || null });
}

// The "Overview" panel (STATUS.md) — free-text prose describing the project, not a
// status indicator (that's the `status` field above, deliberately separate).
export async function saveProjectOverview(slug: string, content: string): Promise<void> {
  await fs.writeFile(path.join(projectsDir(), slug, "STATUS.md"), content, "utf-8");
}

// CGB-17: the client-facing summary (PORTAL.md) shown at the top of a shared
// project's portal page — separate from STATUS.md above, which is
// operator-only prose. Previously hand-edit-only.
export async function savePortalBlurb(slug: string, content: string): Promise<void> {
  await fs.writeFile(path.join(projectsDir(), slug, "PORTAL.md"), content, "utf-8");
}
