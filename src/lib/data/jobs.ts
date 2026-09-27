import fs from "node:fs/promises";
import path from "node:path";
import { receiptsDir } from "./config";

// CR-36 — scheduled-job heartbeats. fleet-backup.sh / fleet-restore-test.sh write
// a `.running` marker at job start and a `.json` summary at the end (see
// scripts/lib/job-marker.sh). bosun-x reads both plus a crontab snapshot so it
// can tell "never started" from "started and died" from "finished with errors" —
// the distinction an ever-ageing receipt alone can't make.

export type JobState = "ok" | "failed" | "running" | "stalled" | "overdue" | "unknown";

export interface JobRun {
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  exit?: number;
  host?: string;
}

export interface JobStatus {
  name: string;
  family?: JobFamily;
  label: string;
  cadenceHours: number;
  state: JobState;
  lastRun?: JobRun;
  ageHours?: number; // since last finish
  runningForHours?: number; // if a .running marker is present
  inCrontab: boolean;
  schedule?: string; // the matching crontab line
}

export interface ScheduleSnapshot {
  capturedAt?: string;
  cron: string[];
  timers: { unit?: string; next?: string; activates?: string }[];
}

// BXD-94: who runs a job's errand in the port. Wrapped cron lines name theirs
// (job-run.sh --family); the fleet jobs below carry one here.
export const JOB_FAMILIES = ["lamplighter", "courier", "warehouse", "watchman", "sweeper", "clerk"] as const;
export type JobFamily = (typeof JOB_FAMILIES)[number];
const asFamily = (v: unknown): JobFamily | undefined => (JOB_FAMILIES as readonly string[]).includes(String(v)) ? (v as JobFamily) : undefined;

interface JobDef {
  name: string;
  label: string;
  cadenceHours: number;
  graceHours: number;
  match: RegExp;
  family?: JobFamily;
}

// Jobs bosun-x expects to see. `match` identifies the job in a crontab line.
const KNOWN_JOBS: JobDef[] = [
  { name: "fleet-backup", label: "Fleet backup", cadenceHours: 24, graceHours: 14, match: /fleet-backup\.sh(?![^\n]*--requests)/, family: "warehouse" },
  { name: "fleet-restore-test", label: "Restore test", cadenceHours: 24 * 7, graceHours: 48, match: /fleet-restore-test\.sh/, family: "warehouse" },
  { name: "fleet-secrets-backup", label: "Secrets bundle", cadenceHours: 24, graceHours: 14, match: /fleet-secrets-backup\.sh/, family: "warehouse" },
  { name: "fleet-offsite-push", label: "Off-site push", cadenceHours: 24, graceHours: 26, match: /fleet-offsite-push\.sh/, family: "warehouse" },
  { name: "data-repo-backup", label: "Data-store backup", cadenceHours: 1, graceHours: 1, match: /(?:bosun-x|control-room)-data-backup\.sh/, family: "clerk" },
  // BXD-45 — weekly proof the fleet scripts still can't remove anything real.
  { name: "safety-check", label: "Fleet safety check", cadenceHours: 24 * 7, graceHours: 48, match: /safety-check\.sh/, family: "watchman" },
  // BXD-62 — 5-minute capacity history for the Servers capacity view.
  { name: "capacity-sample", label: "Capacity sampler", cadenceHours: 5 / 60, graceHours: 0.25, match: /capacity-sample\.sh(?![^\n]*--disk)/ },
  // BXD-65 — daily per-project disk measurement (same script, --disk).
  { name: "capacity-disk", label: "Disk measurement", cadenceHours: 24, graceHours: 6, match: /capacity-sample\.sh[^\n]*--disk/, family: "clerk" },
];

// BXD-94: any crontab line run through scripts/lib/job-run.sh is monitored; its name,
// label, family and cadence come from the markers it writes.
const WRAPPED = /job-run\.sh\s+([A-Za-z0-9._-]+)/;

/** "5m", "2h", "1d", "7d" → hours. */
export function everyHours(every: unknown): number | undefined {
  const m = String(every ?? "").match(/^(\d+(?:\.\d+)?)([mhd])$/);
  if (!m) return undefined;
  return Number(m[1]) * (m[2] === "m" ? 1 / 60 : m[2] === "h" ? 1 : 24);
}

// Recognised as part of a monitored job (so not "unmonitored"), but no heartbeat
// of its own — the fleet-backup request watcher that runs every couple of minutes.
const RECOGNISED_EXTRA = [/fleet-backup\.sh[^\n]*--requests/];

const jobsDir = () => path.join(receiptsDir(), "_jobs");

// ---- run history (BXD-94): _jobs/runs.jsonl, one line per finished run, newest last.
export interface JobHistoryRun {
  job: string;
  label: string;
  family?: JobFamily;
  startedAt?: string;
  finishedAt: string;
  ok: boolean;
}

interface RawRun { job?: string; label?: string; family?: string; every?: string; started_at?: string; finished_at?: string; ok?: boolean; exit?: number }

async function readRawRuns(): Promise<RawRun[]> {
  let text: string;
  try {
    text = await fs.readFile(path.join(jobsDir(), "runs.jsonl"), "utf-8");
  } catch {
    return [];
  }
  const out: RawRun[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as RawRun); } catch { /* a torn line is skipped */ }
  }
  return out;
}

/** Finished runs since `sinceMs`, oldest first, labelled and with their family. */
export async function getJobRuns(sinceMs: number): Promise<JobHistoryRun[]> {
  const known = new Map(KNOWN_JOBS.map((d) => [d.name, d]));
  const runs: JobHistoryRun[] = [];
  for (const r of await readRawRuns()) {
    if (!r.job || !r.finished_at || !(Date.parse(r.finished_at) >= sinceMs)) continue;
    const def = known.get(r.job);
    runs.push({
      job: r.job,
      label: r.label || def?.label || r.job,
      family: asFamily(r.family) ?? def?.family,
      startedAt: r.started_at || undefined,
      finishedAt: r.finished_at,
      ok: r.ok !== false && (r.exit ?? 0) === 0,
    });
  }
  return runs.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}

// Wrapped jobs: every <name>.json marker (or .running) that isn't a known job.
async function wrappedDefs(cron: string[]): Promise<JobDef[]> {
  const known = new Set(KNOWN_JOBS.map((d) => d.name));
  const names = new Set<string>();
  for (const line of cron) {
    const m = line.match(WRAPPED);
    if (m && !known.has(m[1])) names.add(m[1]);
  }
  const files = await fs.readdir(jobsDir()).catch(() => [] as string[]);
  for (const f of files) {
    const m = f.match(/^([A-Za-z0-9._-]+)\.(json|running)$/);
    if (m && m[1] !== "schedule" && !known.has(m[1])) names.add(m[1]);
  }
  const defs: JobDef[] = [];
  for (const name of names) {
    const last = await readJson<RawRun>(path.join(jobsDir(), `${name}.json`));
    const line = cron.find((l) => l.match(WRAPPED)?.[1] === name);
    const every = everyHours(last?.every ?? line?.match(/--every\s+(\S+)/)?.[1]);
    const label = last?.label || line?.match(/--label\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)?.slice(1).find(Boolean) || name;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    defs.push({
      name,
      label,
      // No --every: no cadence to be late against, so never "overdue".
      cadenceHours: every ?? Number.POSITIVE_INFINITY,
      graceHours: every ? Math.max(0.25, every / 2) : 0,
      match: new RegExp(`job-run\\.sh\\s+${escaped}(?![A-Za-z0-9._-])`),
      family: asFamily(last?.family ?? line?.match(/--family\s+(\S+)/)?.[1]),
    });
  }
  return defs.sort((a, b) => a.label.localeCompare(b.label));
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function readScheduleSnapshot(): Promise<ScheduleSnapshot | null> {
  const raw = await readJson<{ captured_at?: string; cron?: string[]; timers?: ScheduleSnapshot["timers"] }>(
    path.join(jobsDir(), "schedule.json"),
  );
  if (!raw) return null;
  // Variable lines (BACKUP_RECEIPTS=..., MAILTO=...) set the environment; they aren't jobs.
  const cron = (raw.cron ?? []).filter((l) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(l.trim()));
  return { capturedAt: raw.captured_at, cron, timers: raw.timers ?? [] };
}

export async function getJobStatuses(): Promise<{
  jobs: JobStatus[];
  unmonitored: string[];
  snapshot: ScheduleSnapshot | null;
  snapshotAgeHours?: number;
}> {
  const snapshot = await readScheduleSnapshot();
  const cron = snapshot?.cron ?? [];
  const now = Date.now();
  const snapshotAgeHours = snapshot?.capturedAt
    ? Math.max(0, (now - Date.parse(snapshot.capturedAt)) / 3_600_000)
    : undefined;

  const defs = [...KNOWN_JOBS, ...(await wrappedDefs(cron))];
  const jobs: JobStatus[] = await Promise.all(
    defs.map(async (def) => {
      const last = await readJson<{
        started_at?: string;
        finished_at?: string;
        ok?: boolean;
        exit?: number;
        host?: string;
      }>(path.join(jobsDir(), `${def.name}.json`));
      const running = await readJson<{ started_at?: string }>(path.join(jobsDir(), `${def.name}.running`));
      const schedule = cron.find((l) => def.match.test(l));

      const lastRun: JobRun | undefined = last
        ? { startedAt: last.started_at, finishedAt: last.finished_at, ok: last.ok, exit: last.exit, host: last.host }
        : undefined;
      const ageHours = lastRun?.finishedAt
        ? Math.max(0, (now - Date.parse(lastRun.finishedAt)) / 3_600_000)
        : undefined;
      const runningForHours = running?.started_at
        ? Math.max(0, (now - Date.parse(running.started_at)) / 3_600_000)
        : undefined;
      const overdueBy = def.cadenceHours + def.graceHours;

      // "overdue" needs prior history — a job that has run before and then went
      // quiet past its cadence. A job in the crontab with no marker at all is
      // "awaiting first heartbeat" (unknown), not an alarm.
      let state: JobState;
      if (running && runningForHours !== undefined && runningForHours > overdueBy) state = "stalled";
      else if (running) state = "running";
      else if (!lastRun) state = "unknown";
      else if (lastRun.ok === false) state = "failed";
      else if (ageHours !== undefined && ageHours > overdueBy) state = "overdue";
      else state = "ok";

      return {
        name: def.name,
        family: def.family,
        label: def.label,
        cadenceHours: def.cadenceHours,
        state,
        lastRun,
        ageHours,
        runningForHours,
        inCrontab: Boolean(schedule),
        schedule,
      };
    }),
  );

  const recognised = [...defs.map((d) => d.match), WRAPPED, ...RECOGNISED_EXTRA];
  const unmonitored = cron.filter((l) => !recognised.some((re) => re.test(l)));

  // Only surface a known job the operator actually runs — it's in the crontab,
  // or it has left a heartbeat behind. A built-in feature that was never set up
  // (e.g. the offsite push) shouldn't read as "no data".
  const visibleJobs = jobs.filter((j) => j.inCrontab || j.lastRun || j.state === "running");

  return { jobs: visibleJobs, unmonitored, snapshot, snapshotAgeHours };
}
