import fs from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import { standardsFile } from "./paths";
import { StandardsYmlSchema } from "./schema";
import { evaluateCheck } from "@/lib/checks/registry";
import type { CheckResult, Project, StandardCheckDef } from "@/lib/types";

export async function loadStandards(): Promise<StandardCheckDef[]> {
  let raw: string;
  try {
    raw = await fs.readFile(standardsFile(), "utf-8");
  } catch {
    return [];
  }
  const parsed = StandardsYmlSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return [];
  return parsed.data.checks;
}

export async function evaluateStandardsForProject(project: Project, checks: StandardCheckDef[]): Promise<CheckResult[]> {
  return Promise.all(checks.map((def) => evaluateCheck(project, def)));
}
