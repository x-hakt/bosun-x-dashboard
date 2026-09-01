import type { Project, StandardCheckDef } from "@/lib/types";
import { evaluateStandardsForProject } from "@/lib/data/standards";

export type HealthState = "healthy" | "attention" | "unknown";

export async function computeHealth(project: Project, standards: StandardCheckDef[]): Promise<HealthState> {
  const required = standards.filter((s) => s.severity === "required");
  if (required.length === 0) return "unknown";

  const results = await evaluateStandardsForProject(project, required);
  if (results.every((r) => r.status === "na")) return "unknown";
  if (results.some((r) => r.status === "fail")) return "attention";
  return "healthy";
}
