import fs from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import type { z } from "zod";
import { backupsFile, destinationsFile } from "./paths";
import { BackupsYmlSchema, BackupStoreSchema, DestinationsYmlSchema } from "./schema";
import type { BackupsConfig, BackupStore, Destination } from "@/lib/types";

// Read-only loaders for the backup config (IDEA-10 / CR-8). The backup agent is a
// separate process; bosun-x only reads these to render status and to write a
// `backup.request` file. Nothing here touches credentials or runs a backup.

export async function loadDestinations(): Promise<Destination[]> {
  let raw: string;
  try {
    raw = await fs.readFile(destinationsFile(), "utf-8");
  } catch {
    return [];
  }
  const parsed = DestinationsYmlSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return [];
  return parsed.data.destinations.map((d) => ({
    id: d.id,
    kind: d.kind,
    path: d.path ?? undefined,
    mount: d.mount ?? undefined,
    sentinel: d.sentinel ?? undefined,
    bucket: d.bucket ?? undefined,
    endpoint: d.endpoint ?? undefined,
    rclone_remote: d.rclone_remote ?? undefined,
    credential_ref: d.credential_ref ?? undefined,
    note: d.note ?? undefined,
  }));
}

export async function getDestination(id: string): Promise<Destination | null> {
  const all = await loadDestinations();
  return all.find((d) => d.id === id) ?? null;
}

function normalizeStore(s: z.infer<typeof BackupStoreSchema>): BackupStore {
  return {
    name: s.name,
    kind: s.kind,
    container: s.container ?? undefined,
    ssh_alias: s.ssh_alias ?? undefined,
    database: s.database ?? undefined,
    path: s.path ?? undefined,
    volume: s.volume ?? undefined,
    schedule: s.schedule ?? undefined,
    retention: s.retention ?? undefined,
    encrypt: s.encrypt ?? undefined,
  };
}

// Returns null when the project has no backups.yml at all (distinct from a file
// that exists but says backup_required: false).
export async function loadBackups(slug: string): Promise<BackupsConfig | null> {
  let raw: string;
  try {
    raw = await fs.readFile(backupsFile(slug), "utf-8");
  } catch {
    return null;
  }
  const parsed = BackupsYmlSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    backup_required: d.backup_required ?? true,
    method: d.method ?? "agent",
    destination: d.destination ?? undefined,
    owner: d.owner ?? undefined,
    stores: (d.stores ?? []).map(normalizeStore),
    notes: d.notes ?? undefined,
  };
}
