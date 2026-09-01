import type { ProjectMeta } from "@/lib/types";
import type { ContainerSummary } from "@/lib/infra/docker";
import { getContainerRefs } from "@/lib/data/project-display";

export type ContainerStatus = "up" | "down" | null;

// Majority vote across a project's linked containers. A ref with no matching live
// container (name mismatch, or the host isn't live-monitored at all) counts as "down" —
// silence isn't evidence of running. No refs at all -> null (nothing to report).
export function computeContainerStatus(meta: ProjectMeta, liveContainers: ContainerSummary[]): ContainerStatus {
  const refs = getContainerRefs(meta);
  if (refs.length === 0) return null;

  let up = 0;
  let down = 0;
  for (const ref of refs) {
    const live = ref.compose_service ? liveContainers.find((c) => c.name === ref.compose_service) : undefined;
    if (live?.state === "running") up++;
    else down++;
  }

  return up > down ? "up" : "down";
}
