import fs from "node:fs/promises";
import path from "node:path";
import { receiptsDir } from "@/lib/data/config";
import { cached } from "@/lib/util/ttl-cache";
import type { DiskRecord, HistorySample } from "./capacity-core";

// BXD-63: reads the capacity sampler's history (BXD-62) back:
// $BACKUP_RECEIPTS/_capacity/<UTC date>.jsonl, one line per host per 5-minute run.
// Failed samples (ok:false) and malformed lines are skipped. The whole window is a few
// MB, parsed at most once per cache period.

const WINDOW_DAYS = 14;
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

interface SampleLine {
  t?: string;
  host?: string;
  ok?: boolean;
  cores?: number;
  mem_total?: number;
  mem_used?: number;
  load1?: number;
  c?: Record<string, [number, number]>;
}

async function readAll(): Promise<Map<string, HistorySample[]>> {
  const dir = path.join(receiptsDir(), "_capacity");
  const byHost = new Map<string, HistorySample[]>();
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => DAY_FILE.test(f)).sort();
  } catch {
    return byHost;
  }
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
  for (const file of files.filter((f) => f.slice(0, 10) >= cutoffDay)) {
    let text: string;
    try {
      text = await fs.readFile(path.join(dir, file), "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      let row: SampleLine;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (!row.ok || !row.host || !row.t || !row.mem_total || Date.parse(row.t) < cutoff) continue;
      const list = byHost.get(row.host) ?? [];
      list.push({
        t: row.t,
        cores: row.cores ?? 0,
        memTotal: row.mem_total,
        memUsed: row.mem_used ?? 0,
        load1: row.load1 ?? 0,
        c: row.c ?? {},
      });
      byHost.set(row.host, list);
    }
  }
  return byHost;
}

// Five minutes: a new sample only lands every five minutes anyway.
export async function getCapacityHistory(): Promise<Map<string, HistorySample[]>> {
  return cached("capacity:history", 5 * 60_000, readAll);
}

// BXD-65: the newest daily disk measurement (_capacity/disk-<date>.json), per host.
// Measurements older than a few days are ignored rather than shown as current.
const DISK_FILE = /^disk-\d{4}-\d{2}-\d{2}\.json$/;
const DISK_MAX_AGE_DAYS = 3;

async function readLatestDisk(): Promise<Map<string, DiskRecord>> {
  const dir = path.join(receiptsDir(), "_capacity");
  const out = new Map<string, DiskRecord>();
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => DISK_FILE.test(f)).sort().reverse();
  } catch {
    return out;
  }
  // Newest file first; an older file only fills in hosts the newer one lacks.
  for (const file of files.slice(0, DISK_MAX_AGE_DAYS)) {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, file), "utf-8")) as { hosts?: Record<string, DiskRecord> };
      for (const [host, record] of Object.entries(parsed.hosts ?? {})) {
        if (out.has(host) || !record?.diskSizeBytes) continue;
        if (record.t && Date.now() - Date.parse(record.t) > DISK_MAX_AGE_DAYS * 86_400_000) continue;
        out.set(host, record);
      }
    } catch {
      continue;
    }
  }
  return out;
}

export async function getLatestDisk(): Promise<Map<string, DiskRecord>> {
  return cached("capacity:disk", 10 * 60_000, readLatestDisk);
}
