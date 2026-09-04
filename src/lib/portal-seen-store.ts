// Per-client "last seen the portal" timestamps for the CGB-9 digest.
//
// One tiny JSON file per client under DATA_DIR/.portal-state/, written by the
// portal deployment when a client loads the home page and read to work out what
// changed since. Not operator content — the data repo gitignores .portal-state/.
//
// Lives outside src/lib/portal/** so both the projection (read) and reply.ts
// (write, via the audited boundary) can use it without widening the eslint fence;
// it only touches this one directory, never a data loader.

import fs from "node:fs/promises";
import path from "node:path";
import { portalStateDir } from "@/lib/data/paths";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

function seenFile(clientSlug: string): string {
  return path.join(portalStateDir(), `${clientSlug}.json`);
}

// ISO timestamp of this client's previous portal visit, or null on the first
// visit / an unreadable file.
export async function readPortalSeenAt(clientSlug: string): Promise<string | null> {
  if (!SLUG_RE.test(clientSlug)) return null;
  try {
    const parsed = JSON.parse(await fs.readFile(seenFile(clientSlug), "utf-8"));
    return typeof parsed?.seen_at === "string" ? parsed.seen_at : null;
  } catch {
    return null;
  }
}

export async function writePortalSeenAt(clientSlug: string, iso: string): Promise<void> {
  if (!SLUG_RE.test(clientSlug)) throw new Error("bad client slug");
  await fs.mkdir(portalStateDir(), { recursive: true });
  await fs.writeFile(seenFile(clientSlug), `${JSON.stringify({ seen_at: iso })}\n`, "utf-8");
}
