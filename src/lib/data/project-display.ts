import type { ProjectContainer, ProjectMeta } from "@/lib/types";

export function displayName(meta: ProjectMeta): string {
  return meta.display_name || meta.name || meta.slug;
}

// Normalizes the legacy single `container` field and the newer `containers` list
// into one array — callers should never touch `meta.container`/`meta.containers` directly.
export function getContainerRefs(meta: ProjectMeta): ProjectContainer[] {
  if (meta.containers && meta.containers.length > 0) return meta.containers;
  if (meta.container) return [meta.container];
  return [];
}
