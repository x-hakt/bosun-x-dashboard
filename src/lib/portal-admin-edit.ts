// Pure edit helpers for the client-portal registry (<DATA_DIR>/clients.yml).
//
// Operator-side only — the portal deployment never edits the registry, it only
// reads it (src/lib/data/clients.ts). Kept out of src/lib/portal/** on purpose:
// that tree is fenced off from @/lib/data, and these need the schema. The
// "use server" wrapper that actually touches disk is src/lib/actions/portal-admin.ts.
//
// Every function takes the whole parsed document and returns a new one; the
// caller validates with `assertValidRegistry` before writing.

import { ClientsYmlSchema } from "@/lib/data/schema";

// The raw shape of clients.yml as js-yaml hands it back. `portals` is a map
// keyed by slug; `clients` is a list. Values stay loosely typed here — the zod
// schema is the gate.
export interface RegistryDoc {
  portals: Record<string, PortalEntry>;
  clients: ClientEntry[];
}

export interface PortalEntry {
  name: string;
  url?: string;
  theme?: Record<string, string>;
}

export interface ClientEntry {
  slug: string;
  name: string;
  portal: string;
  emails: string[];
  note?: string;
}

// The theme keys the portal layout understands (mirrors PortalThemeSchema). The
// admin form renders one input per key; anything else is dropped on save.
export const PORTAL_THEME_KEYS = [
  "brand_name",
  "tagline",
  "logo_url",
  "favicon_url",
  "site_url",
  "contact_email",
  "accent",
  "accent_strong",
  "paper",
  "surface",
  "footer_bg",
  "ink",
  "ink_soft",
  "ink_faint",
  "heading_font",
  "body_font",
] as const;

export type PortalThemeKey = (typeof PORTAL_THEME_KEYS)[number];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function emptyRegistry(): RegistryDoc {
  return { portals: {}, clients: [] };
}

// Normalises whatever js-yaml produced (missing keys, wrong types) into a
// RegistryDoc without validating semantics — that's `assertValidRegistry`.
export function coerceRegistry(raw: unknown): RegistryDoc {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const portals: Record<string, PortalEntry> = {};
  if (obj.portals && typeof obj.portals === "object") {
    for (const [slug, value] of Object.entries(obj.portals as Record<string, unknown>)) {
      const p = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const theme =
        p.theme && typeof p.theme === "object"
          ? Object.fromEntries(
              Object.entries(p.theme as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string" && v.trim() !== "")
                .map(([k, v]) => [k, String(v)]),
            )
          : undefined;
      portals[slug] = {
        name: typeof p.name === "string" ? p.name : slug,
        url: typeof p.url === "string" && p.url.trim() ? p.url.trim() : undefined,
        theme: theme && Object.keys(theme).length ? theme : undefined,
      };
    }
  }
  const clients: ClientEntry[] = Array.isArray(obj.clients)
    ? (obj.clients as unknown[]).map((value) => {
        const c = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        return {
          slug: typeof c.slug === "string" ? c.slug : "",
          name: typeof c.name === "string" ? c.name : "",
          portal: typeof c.portal === "string" ? c.portal : "",
          emails: Array.isArray(c.emails)
            ? (c.emails as unknown[]).map((e) => String(e).trim().toLowerCase()).filter(Boolean)
            : [],
          note: typeof c.note === "string" && c.note.trim() ? c.note.trim() : undefined,
        };
      })
    : [];
  return { portals, clients };
}

export interface PortalInput {
  name: string;
  url?: string;
  theme?: Partial<Record<PortalThemeKey, string>>;
}

// Create or replace a portal. `slug` must be a fresh slug on create; on update it
// must already exist. Empty theme values are dropped so the file stays tidy.
export function upsertPortal(doc: RegistryDoc, slug: string, input: PortalInput): RegistryDoc {
  const clean = slug.trim().toLowerCase();
  if (!SLUG_RE.test(clean)) throw new Error(`Portal slug must be lower-case letters, digits and dashes (got "${slug}").`);
  const name = input.name.trim();
  if (!name) throw new Error("Portal needs a name.");

  const theme: Record<string, string> = {};
  for (const key of PORTAL_THEME_KEYS) {
    const value = input.theme?.[key]?.trim();
    if (value) theme[key] = value;
  }

  return {
    ...doc,
    portals: {
      ...doc.portals,
      [clean]: {
        name,
        url: input.url?.trim() || undefined,
        theme: Object.keys(theme).length ? theme : undefined,
      },
    },
  };
}

export function removePortal(doc: RegistryDoc, slug: string): RegistryDoc {
  const dependents = doc.clients.filter((c) => c.portal === slug).map((c) => c.slug);
  if (dependents.length) {
    throw new Error(
      `Can't delete portal "${slug}" — ${dependents.length} client(s) still belong to it (${dependents.join(", ")}). Move or remove them first.`,
    );
  }
  const portals = { ...doc.portals };
  delete portals[slug];
  return { ...doc, portals };
}

export interface ClientInput {
  name: string;
  portal: string;
  emails: string[];
  note?: string;
}

// Create or replace a client. On create `slug` must be fresh; on update it must
// exist. The named portal must exist. Emails are lower-cased and de-duped; at
// least one valid address is required.
export function upsertClient(doc: RegistryDoc, slug: string, input: ClientInput): RegistryDoc {
  const clean = slug.trim().toLowerCase();
  if (!SLUG_RE.test(clean)) throw new Error(`Client slug must be lower-case letters, digits and dashes (got "${slug}").`);
  const name = input.name.trim();
  if (!name) throw new Error("Client needs a name.");
  if (!doc.portals[input.portal]) throw new Error(`Unknown portal "${input.portal}".`);

  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new Error("Client needs at least one sign-in email.");
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  if (bad) throw new Error(`"${bad}" doesn't look like an email address.`);

  const entry: ClientEntry = { slug: clean, name, portal: input.portal, emails, note: input.note?.trim() || undefined };
  const clients = doc.clients.some((c) => c.slug === clean)
    ? doc.clients.map((c) => (c.slug === clean ? entry : c))
    : [...doc.clients, entry];
  return { ...doc, clients };
}

export function removeClient(doc: RegistryDoc, slug: string): RegistryDoc {
  return { ...doc, clients: doc.clients.filter((c) => c.slug !== slug) };
}

// Serialise for js-yaml: drop undefined keys and empty maps/lists so clients.yml
// reads clean, and omit `theme`/`note`/`url` entirely when unset.
export function serialiseRegistry(doc: RegistryDoc): Record<string, unknown> {
  const portals: Record<string, unknown> = {};
  for (const [slug, p] of Object.entries(doc.portals)) {
    portals[slug] = {
      name: p.name,
      ...(p.url ? { url: p.url } : {}),
      ...(p.theme && Object.keys(p.theme).length ? { theme: p.theme } : {}),
    };
  }
  const clients = doc.clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    portal: c.portal,
    emails: c.emails,
    ...(c.note ? { note: c.note } : {}),
  }));
  const out: Record<string, unknown> = {};
  if (Object.keys(portals).length) out.portals = portals;
  if (clients.length) out.clients = clients;
  return out;
}

// Final gate before writing — the same schema src/lib/data/clients.ts reads with.
export function assertValidRegistry(doc: RegistryDoc): void {
  const parsed = ClientsYmlSchema.safeParse(serialiseRegistry(doc));
  if (!parsed.success) {
    throw new Error(
      `clients.yml would be invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    );
  }
}
