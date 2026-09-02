"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { revalidatePath } from "next/cache";
import { requestBackup, requestRestoreTest } from "@/lib/data/backup-request";
import { backupsFile, DATA_DIR } from "@/lib/data/paths";
import { BackupsYmlSchema } from "@/lib/data/schema";

// Writes the request file the fleet-backup agent drains on its next `--requests`
// pass (host cron, every 2 min). bosun-x never runs the backup itself.
export async function triggerBackup(slug: string): Promise<void> {
  await requestBackup(slug);
}

// Same handshake for a restore test — the agent hands it to fleet-restore-test.sh.
export async function triggerRestoreTest(slug: string): Promise<void> {
  await requestRestoreTest(slug);
}

export interface BackupsPatch {
  backup_required?: boolean;
  destination?: string;
  // per-store edits keyed by store name
  stores?: Record<string, { schedule?: string; keep_last?: number; age_recipient?: string | null }>;
}

// Edits an existing backups.yml from the Backup pane (CR-35). Only the scalar
// knobs — destination, per-store schedule / retention / encryption. Adding or
// removing a store still means editing the file (it needs kind + a source).
// Comments are not preserved; the pane is the documentation.
export async function saveBackups(slug: string, patch: BackupsPatch): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("bad slug");
  const raw = await fs.readFile(backupsFile(slug), "utf-8");
  const doc = (loadYaml(raw) ?? {}) as Record<string, unknown>;

  if (patch.backup_required !== undefined) doc.backup_required = patch.backup_required;
  if (patch.destination !== undefined) doc.destination = patch.destination || undefined;

  if (patch.stores) {
    const stores = Array.isArray(doc.stores) ? (doc.stores as Record<string, unknown>[]) : [];
    for (const s of stores) {
      const edit = patch.stores[String(s.name)];
      if (!edit) continue;
      if (edit.schedule !== undefined) s.schedule = edit.schedule || undefined;
      if (edit.keep_last !== undefined) {
        s.retention = edit.keep_last > 0 ? { keep_last: Math.floor(edit.keep_last) } : undefined;
      }
      if (edit.age_recipient !== undefined) {
        s.encrypt = edit.age_recipient ? { age_recipient: edit.age_recipient } : undefined;
      }
    }
  }

  const parsed = BackupsYmlSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error(`Invalid backups.yml: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }

  const header = "# Edited from the Backups pane. Add or remove a store by editing this file directly.\n";
  await fs.writeFile(backupsFile(slug), header + dumpYaml(doc), "utf-8");
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/backups");
}

// The one place bosun-x reads a secret — the age *identity* (restore key) for an
// encrypted store, so a restore can be driven from the UI. The agent only ever
// uses the public recipient. IDEA-10 flags this as a deliberate exception.
export async function revealRestoreKey(slug: string): Promise<string> {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("bad slug");
  const cfg = BackupsYmlSchema.safeParse(loadYaml(await fs.readFile(backupsFile(slug), "utf-8")));
  const hasEncrypted = cfg.success && (cfg.data.stores ?? []).some((s) => s.encrypt?.age_recipient);
  if (!hasEncrypted) throw new Error("this project has no encrypted store");
  try {
    return (await fs.readFile(path.join(DATA_DIR, "backup-keys", `${slug}.age`), "utf-8")).trim();
  } catch {
    throw new Error(`restore key not found at backup-keys/${slug}.age`);
  }
}
