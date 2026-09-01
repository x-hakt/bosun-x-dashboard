"use server";

import fs from "node:fs/promises";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { revalidatePath } from "next/cache";
import { configFile } from "@/lib/data/paths";
import { clearConfigCache } from "@/lib/data/config";
import { ConfigYmlSchema } from "@/lib/data/schema";

type ConfigValue = string | string[];

// Merges a patch from the Settings page into config.yml. An empty string or empty
// list clears the key (reverting it to its default). Comments are not preserved —
// the Settings page is the documentation now.
export async function saveConfig(patch: Record<string, ConfigValue>): Promise<void> {
  let current: Record<string, unknown> = {};
  try {
    const raw = loadYaml(await fs.readFile(configFile(), "utf-8"));
    if (raw && typeof raw === "object") current = raw as Record<string, unknown>;
  } catch {
    // no file yet — start fresh
  }

  for (const [key, value] of Object.entries(patch)) {
    const empty = value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) delete current[key];
    else current[key] = value;
  }

  const parsed = ConfigYmlSchema.safeParse(current);
  if (!parsed.success) {
    throw new Error(`Invalid config: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }

  const header = "# Edited from the dashboard Settings page. Each key is documented there.\n";
  await fs.writeFile(configFile(), header + dumpYaml(current), "utf-8");
  clearConfigCache();
  revalidatePath("/", "layout");
}
