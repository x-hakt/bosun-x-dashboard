import fs from "node:fs/promises";
import path from "node:path";
import { receiptsDir } from "./config";

// The append-only run history the fleet agents keep next to each project's
// receipts: <slug>/log.jsonl (backups) and <slug>/<store>.restore-log.jsonl
// (restore tests). One JSON object per line, newest last. Read-only.

export interface BackupLogEntry {
  store: string;
  finishedAt?: string;
  ok: boolean;
  bytes?: number;
  archive?: string;
  error?: string;
}

export interface RestoreLogEntry {
  store: string;
  testedAt?: string;
  archive?: string;
  archiveAgeH?: number;
  kind?: string;
  checksumOk: boolean;
  tocEntries?: number;
  tables?: number;
  rows?: number;
  ok: boolean;
  error?: string;
}

async function tailJsonl(file: string, limit: number): Promise<Record<string, unknown>[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const out: Record<string, unknown>[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* skip a malformed line */
    }
  }
  return out.reverse(); // newest first
}

export async function readBackupLog(slug: string, limit = 10): Promise<BackupLogEntry[]> {
  const rows = await tailJsonl(path.join(receiptsDir(), slug, "log.jsonl"), limit * 3);
  return rows
    .map((r) => ({
      store: String(r.store ?? ""),
      finishedAt: r.finished_at as string | undefined,
      ok: Boolean(r.ok),
      bytes: typeof r.bytes === "number" ? r.bytes : undefined,
      archive: r.archive as string | undefined,
      error: (r.error as string | undefined) || undefined,
    }))
    .slice(0, limit);
}

export async function readRestoreLog(slug: string, store: string, limit = 10): Promise<RestoreLogEntry[]> {
  const rows = await tailJsonl(path.join(receiptsDir(), slug, `${store}.restore-log.jsonl`), limit * 2);
  return rows
    .map((r) => ({
      store: String(r.store ?? store),
      testedAt: r.tested_at as string | undefined,
      archive: r.archive as string | undefined,
      archiveAgeH: typeof r.archive_age_h === "number" ? r.archive_age_h : undefined,
      kind: r.kind as string | undefined,
      checksumOk: Boolean(r.checksum_ok),
      tocEntries: typeof r.toc_entries === "number" ? r.toc_entries : undefined,
      tables: typeof r.tables === "number" ? r.tables : undefined,
      rows: typeof r.rows === "number" ? r.rows : undefined,
      ok: Boolean(r.ok),
      error: (r.error as string | undefined) || undefined,
    }))
    .slice(0, limit);
}
