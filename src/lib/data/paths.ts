import path from "node:path";

// In production DATA_DIR points at the bind-mounted host folder (/app/data).
// In local dev it defaults to ./data (gitignored) — run `npm run init-data` once
// to seed it from the git-tracked data.example/ reference copy.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const projectsDir = () => path.join(DATA_DIR, "projects");
export const standardsFile = () => path.join(DATA_DIR, "standards.yml");
export const importedDir = () => path.join(DATA_DIR, "imported");
export const notesFile = () => path.join(DATA_DIR, "notes.yml");
export const hostsFile = () => path.join(DATA_DIR, "infra", "hosts.yml");
export const docsDir = () => path.join(DATA_DIR, "docs");
export const planningDir = () => path.join(DATA_DIR, "planning");
export const destinationsFile = () => path.join(DATA_DIR, "infra", "destinations.yml");
export const backupsFile = (slug: string) => path.join(projectsDir(), slug, "backups.yml");
export const configFile = () => path.join(DATA_DIR, "config.yml");
export const clientsFile = () => path.join(DATA_DIR, "clients.yml");
// Portal-generated runtime state (per-client "last seen" timestamps for the
// CGB-9 digest). Written by the portal deployment, not operator content — the
// data repo gitignores it.
export const portalStateDir = () => path.join(DATA_DIR, ".portal-state");
// CGB-10: one always-on client<->operator message thread per client, kept
// alongside portal-messages/<slug>/meta.yml. Real content — tracked in git,
// unlike .portal-state above.
export const portalMessagesDir = () => path.join(DATA_DIR, "portal-messages");
// receiptsDir() moved to lib/data/config.ts (it reads config.yml).
