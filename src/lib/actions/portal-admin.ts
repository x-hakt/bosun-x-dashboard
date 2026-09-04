"use server";

import fs from "node:fs/promises";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { revalidatePath } from "next/cache";
import { clientsFile } from "@/lib/data/paths";
import {
  coerceRegistry,
  emptyRegistry,
  serialiseRegistry,
  assertValidRegistry,
  upsertPortal,
  removePortal,
  upsertClient,
  removeClient,
  type RegistryDoc,
  type PortalInput,
  type ClientInput,
} from "@/lib/portal-admin-edit";

// The operator's Settings → Client portals editor. clients.yml is rewritten
// whole from a validated model (same approach as saveConfig for config.yml) —
// comments aren't preserved; the Settings page is the documentation.

const HEADER =
  "# Client portal registry (CGB-2.1). Edited from the dashboard → Settings → Client portals.\n" +
  "# portals: the branded client-facing surfaces. clients: the people invited into one.\n" +
  "# A project/idea/note reaches a portal only with BOTH `portals: [slug]` and `shared_with: [client]`.\n";

async function readRegistry(): Promise<RegistryDoc> {
  try {
    return coerceRegistry(loadYaml(await fs.readFile(clientsFile(), "utf-8")));
  } catch {
    return emptyRegistry();
  }
}

async function writeRegistry(doc: RegistryDoc): Promise<void> {
  assertValidRegistry(doc);
  await fs.writeFile(clientsFile(), HEADER + dumpYaml(serialiseRegistry(doc)), "utf-8");
  // portals/clients feed the sidebar-independent share controls and the portal
  // deployment; bust everything.
  revalidatePath("/", "layout");
  revalidatePath("/settings/portals");
}

export async function savePortalEntry(slug: string, input: PortalInput): Promise<void> {
  await writeRegistry(upsertPortal(await readRegistry(), slug, input));
}

export async function deletePortalEntry(slug: string): Promise<void> {
  await writeRegistry(removePortal(await readRegistry(), slug));
}

export async function saveClientEntry(slug: string, input: ClientInput): Promise<void> {
  await writeRegistry(upsertClient(await readRegistry(), slug, input));
}

export async function deleteClientEntry(slug: string): Promise<void> {
  await writeRegistry(removeClient(await readRegistry(), slug));
}
