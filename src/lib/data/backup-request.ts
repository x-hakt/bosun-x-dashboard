import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./paths";

// The "run backup now" handshake (IDEA-10 Layer 5). bosun-x only writes a
// request file; the fleet-backup agent (host cron, `--requests` every 2 min)
// picks it up, runs that project's backup, and deletes the file. Nothing here
// touches credentials or the NAS.

const REQUEST_DIR = path.join(DATA_DIR, ".backup-requests");

export async function requestBackup(slug: string, by = "control-room"): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("bad slug");
  await fs.mkdir(REQUEST_DIR, { recursive: true });
  await fs.writeFile(
    path.join(REQUEST_DIR, `${slug}.request`),
    JSON.stringify({ slug, requested_at: new Date().toISOString(), by }) + "\n",
    "utf-8",
  );
}

export async function backupRequestPending(slug: string): Promise<boolean> {
  try {
    await fs.access(path.join(REQUEST_DIR, `${slug}.request`));
    return true;
  } catch {
    return false;
  }
}
