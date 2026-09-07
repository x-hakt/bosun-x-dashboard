import fs from "node:fs/promises";
import path from "node:path";
import { docsDir } from "./paths";
import { loadBackups } from "./backups";
import { listProjects } from "./projects";

// BXD-44 — the weekly fleet-restore-test proves each archive restores into a
// throwaway container. It can't prove the full "blank box → serving" drill, so
// that stays manual (docs/restore-drills.md, roughly quarterly, for the projects
// whose backups.yml sets `restore_drill: true`). Nothing prompted it before this.
// Read-only: bosun-x parses the log, it never runs a drill.

// Quarterly cadence + a month of slack before it reads as overdue.
export const DRILL_STALE_DAYS = 100;

export interface RestoreDrillStatus {
  slug: string;
  lastDrillAt?: string; // YYYY-MM-DD as written in the log
  ageDays?: number;
  stale: boolean; // no drill ever, or the newest is older than DRILL_STALE_DAYS
}

// Parse the "## Log" markdown table. Rows whose Date cell isn't YYYY-MM-DD or
// YYYY-MM (e.g. the "_(none yet — …)_" placeholder) are ignored.
function parseDrillLog(md: string): Map<string, string> {
  const newest = new Map<string, string>();
  const lines = md.split("\n");
  const logAt = lines.findIndex((l) => /^#+\s+Log\s*$/i.test(l.trim()));
  if (logAt === -1) return newest;

  for (const line of lines.slice(logAt + 1)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const [rawDate, rawProject] = cells;
    if (/^-+$/.test(rawDate) || rawDate.toLowerCase() === "date") continue; // separator / header

    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(rawDate);
    if (!m) continue;
    const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
    if (Number.isNaN(Date.parse(iso))) continue;

    const slug = rawProject.toLowerCase().trim();
    if (!slug) continue;
    if (!newest.has(slug) || newest.get(slug)! < iso) newest.set(slug, rawDate);
  }
  return newest;
}

let cached: { at: number; map: Map<string, string> } | null = null;

async function drillLog(): Promise<Map<string, string>> {
  // The file changes only when an operator logs a drill — a short in-process
  // cache keeps every project's status check from re-reading it.
  if (cached && Date.now() - cached.at < 60_000) return cached.map;
  let md = "";
  try {
    md = await fs.readFile(path.join(docsDir(), "restore-drills.md"), "utf-8");
  } catch {
    md = "";
  }
  const map = parseDrillLog(md);
  cached = { at: Date.now(), map };
  return map;
}

function daysSince(dateOrIso: string): number | undefined {
  const iso = /^\d{4}-\d{2}$/.test(dateOrIso) ? `${dateOrIso}-01` : dateOrIso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

// null when the project doesn't require a drill (backups.yml has no
// `restore_drill: true`); otherwise its current standing.
export async function getRestoreDrillStatus(slug: string): Promise<RestoreDrillStatus | null> {
  const cfg = await loadBackups(slug);
  if (!cfg?.restore_drill) return null;

  const last = (await drillLog()).get(slug);
  const ageDays = last ? daysSince(last) : undefined;
  return {
    slug,
    lastDrillAt: last,
    ageDays: ageDays === undefined ? undefined : Math.round(ageDays),
    stale: ageDays === undefined || ageDays > DRILL_STALE_DAYS,
  };
}

export async function getAllRestoreDrillStatuses(): Promise<RestoreDrillStatus[]> {
  const projects = await listProjects();
  const all = await Promise.all(projects.map((p) => getRestoreDrillStatus(p.meta.slug)));
  return all.filter((s): s is RestoreDrillStatus => s !== null);
}
