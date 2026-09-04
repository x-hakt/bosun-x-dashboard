import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./paths";

// The "run backup now" handshake (IDEA-10 Layer 5). bosun-x only writes a
// request file; the fleet-backup agent (host cron, `--requests` every 2 min)
// picks it up, runs that project's backup, and deletes the file. Nothing here
// touches credentials or the NAS.

const REQUEST_DIR = path.join(DATA_DIR, ".backup-requests");

export async function requestBackup(slug: string, by = "bosun-x"): Promise<void> {
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

// "run a restore test now" — same handshake, a `.restore-request` file the
// fleet-backup agent's `--requests` pass hands to fleet-restore-test.sh.
export async function requestRestoreTest(slug: string, by = "bosun-x"): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("bad slug");
  await fs.mkdir(REQUEST_DIR, { recursive: true });
  await fs.writeFile(
    path.join(REQUEST_DIR, `${slug}.restore-request`),
    JSON.stringify({ slug, requested_at: new Date().toISOString(), by }) + "\n",
    "utf-8",
  );
}

export async function restoreTestPending(slug: string): Promise<boolean> {
  try {
    await fs.access(path.join(REQUEST_DIR, `${slug}.restore-request`));
    return true;
  } catch {
    return false;
  }
}

// "restore into the live database now" (CR-38). Written only after a
// type-to-confirm in the UI. fleet-restore.sh always takes a pre-restore dump
// first, so the operation is reversible. One in-flight request per project.
export async function requestLiveRestore(
  slug: string,
  store: string,
  archive: string,
  by = "bosun-x",
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("bad slug");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(store)) throw new Error("bad store");
  // archive is either "latest" or a bare filename (no path separators)
  if (archive !== "latest" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(archive)) {
    throw new Error("bad archive name");
  }
  await fs.mkdir(REQUEST_DIR, { recursive: true });
  await fs.writeFile(
    path.join(REQUEST_DIR, `${slug}.restore-live-request`),
    JSON.stringify({ slug, store, archive, requested_at: new Date().toISOString(), by }) + "\n",
    "utf-8",
  );
}

export async function liveRestorePending(slug: string): Promise<boolean> {
  try {
    await fs.access(path.join(REQUEST_DIR, `${slug}.restore-live-request`));
    return true;
  } catch {
    return false;
  }
}
