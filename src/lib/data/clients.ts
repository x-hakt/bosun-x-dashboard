import fs from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import { clientsFile } from "./paths";
import { ClientsYmlSchema } from "./schema";
import type { Client, Portal } from "@/lib/types";

// The client-portal registry (CGB-2.1): <DATA_DIR>/clients.yml. Read-only here — the
// operator app edits it through a server action, the portal deployment only reads it.
// Absent or invalid file => no portals, no clients, every gate closed.

export interface ClientRegistry {
  portals: Portal[];
  clients: Client[];
}

const EMPTY: ClientRegistry = { portals: [], clients: [] };

export async function loadClientRegistry(): Promise<ClientRegistry> {
  let raw: string;
  try {
    raw = await fs.readFile(clientsFile(), "utf-8");
  } catch {
    return EMPTY;
  }
  const parsed = ClientsYmlSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return EMPTY;

  const portals: Portal[] = Object.entries(parsed.data.portals ?? {}).map(([slug, def]) => ({
    slug,
    name: def.name,
    url: def.url ?? undefined,
    theme: def.theme
      ? {
          brand_name: def.theme.brand_name ?? undefined,
          tagline: def.theme.tagline ?? undefined,
          logo_url: def.theme.logo_url ?? undefined,
          favicon_url: def.theme.favicon_url ?? undefined,
          site_url: def.theme.site_url ?? undefined,
          accent: def.theme.accent ?? undefined,
          accent_strong: def.theme.accent_strong ?? undefined,
          paper: def.theme.paper ?? undefined,
          ink: def.theme.ink ?? undefined,
          heading_font: def.theme.heading_font ?? undefined,
          body_font: def.theme.body_font ?? undefined,
        }
      : undefined,
  }));

  const clients: Client[] = (parsed.data.clients ?? []).map((c) => ({
    slug: c.slug,
    name: c.name,
    portal: c.portal,
    emails: (c.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
    note: c.note ?? undefined,
  }));

  return { portals, clients };
}

export async function getPortal(slug: string): Promise<Portal | undefined> {
  return (await loadClientRegistry()).portals.find((p) => p.slug === slug);
}

export async function getClient(slug: string): Promise<Client | undefined> {
  return (await loadClientRegistry()).clients.find((c) => c.slug === slug);
}

// Every client belonging to one portal.
export async function clientsOfPortal(portalSlug: string): Promise<Client[]> {
  return (await loadClientRegistry()).clients.filter((c) => c.portal === portalSlug);
}

// Resolve a sign-in email to the client it belongs to within one portal. Email match
// is exact (already lower-cased). Returns undefined if the address isn't invited.
export async function clientForEmail(portalSlug: string, email: string): Promise<Client | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  return (await clientsOfPortal(portalSlug)).find((c) => c.emails.includes(normalized));
}
