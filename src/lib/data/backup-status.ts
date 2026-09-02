import fs from "node:fs/promises";
import path from "node:path";
import { loadBackups } from "./backups";
import { receiptsDir } from "./config";
import { listProjects } from "./projects";
import type { BackupHealth, BackupRestoreStatus, BackupStatus, BackupStoreStatus } from "@/lib/types";

// Read-only. Combines a project's backups.yml with the receipts fleet-backup.sh
// leaves under receiptsDir()/<slug>/<store>.latest.json. bosun-x never runs
// a backup — it reports what the agent recorded.

interface Receipt {
  store?: string;
  finished_at?: string;
  ok?: boolean;
  bytes?: number;
  sha256?: string;
  archive?: string;
  error?: string;
}

const GRACE_HOURS = 12;
// The restore test runs weekly; give it a week + a day before "stale". A store
// is only counted stale once its backup is at least this old too — a brand-new
// project isn't failing just because Monday hasn't come round yet.
const RESTORE_CADENCE_HOURS = 8 * 24;

interface RestoreReceipt {
  tested_at?: string;
  archive_age_h?: number;
  kind?: string;
  checksum_ok?: boolean;
  toc_entries?: number;
  tables?: number;
  rows?: number;
  ok?: boolean;
  error?: string;
}

async function readRestoreReceipt(slug: string, store: string): Promise<RestoreReceipt | null> {
  try {
    const raw = await fs.readFile(path.join(receiptsDir(), slug, `${store}.restore.json`), "utf-8");
    return JSON.parse(raw) as RestoreReceipt;
  } catch {
    return null;
  }
}

function restoreStatusOf(r: RestoreReceipt | null, backupAgeHours: number | undefined): BackupRestoreStatus | null {
  if (!r) {
    return backupAgeHours !== undefined && backupAgeHours > RESTORE_CADENCE_HOURS
      ? { checksumOk: false, ok: false, stale: true }
      : null;
  }
  const ageHours = r.tested_at
    ? Math.max(0, (Date.now() - Date.parse(r.tested_at)) / 3_600_000)
    : undefined;
  const stale = !r.ok || ageHours === undefined || ageHours > RESTORE_CADENCE_HOURS;
  return {
    testedAt: r.tested_at,
    ageHours,
    kind: r.kind,
    checksumOk: Boolean(r.checksum_ok),
    tocEntries: r.toc_entries,
    tables: r.tables,
    rows: r.rows,
    ok: Boolean(r.ok),
    error: r.error,
    stale,
  };
}

function scheduleToHours(schedule: string | undefined): number {
  switch ((schedule ?? "nightly").toLowerCase()) {
    case "hourly": return 1;
    case "nightly":
    case "daily": return 24;
    case "weekly": return 24 * 7;
    default: return 24;
  }
}

async function readReceipt(slug: string, store: string): Promise<Receipt | null> {
  try {
    const raw = await fs.readFile(path.join(receiptsDir(), slug, `${store}.latest.json`), "utf-8");
    return JSON.parse(raw) as Receipt;
  } catch {
    return null;
  }
}

export async function getBackupStatus(slug: string): Promise<BackupStatus | null> {
  const cfg = await loadBackups(slug);
  if (!cfg) return null;

  if (cfg.method !== "agent") {
    return {
      slug,
      required: cfg.backup_required,
      method: cfg.method,
      destination: cfg.destination,
      health: cfg.method === "git" ? "git" : "none",
      stores: [],
      notes: cfg.notes,
    };
  }

  const stores: BackupStoreStatus[] = await Promise.all(
    cfg.stores.map(async (s) => {
      const scheduleHours = scheduleToHours(s.schedule);
      const r = await readReceipt(slug, s.name);
      const ageHours = r?.finished_at
        ? Math.max(0, (Date.now() - Date.parse(r.finished_at)) / 3_600_000)
        : undefined;
      const stale = r?.ok === true && ageHours !== undefined && ageHours > scheduleHours + GRACE_HOURS;
      const restore = restoreStatusOf(await readRestoreReceipt(slug, s.name), ageHours);
      return {
        name: s.name,
        kind: s.kind,
        ok: r ? Boolean(r.ok) : null,
        lastRunAt: r?.finished_at,
        ageHours,
        bytes: r?.bytes,
        archive: r?.archive,
        error: r?.error || undefined,
        encrypted: Boolean(s.encrypt?.age_recipient),
        scheduleHours,
        stale,
        restore,
      };
    }),
  );

  let health: BackupHealth = "ok";
  if (stores.length === 0) health = "unknown";
  else if (stores.some((s) => s.ok === false)) health = "failing";
  else if (stores.some((s) => s.ok === null)) health = "unknown";
  else if (stores.some((s) => s.stale)) health = "stale";
  else if (stores.some((s) => s.restore?.stale)) health = "unverified";

  return {
    slug,
    required: cfg.backup_required,
    method: "agent",
    destination: cfg.destination,
    health,
    stores,
    notes: cfg.notes,
  };
}

export async function getAllBackupStatuses(): Promise<BackupStatus[]> {
  const projects = await listProjects();
  const all = await Promise.all(projects.map((p) => getBackupStatus(p.meta.slug)));
  return all.filter((s): s is BackupStatus => s !== null);
}
