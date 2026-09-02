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

interface JobDef {
  name: string;
  label: string;
  cadenceHours: number;
  graceHours: number;
  match: RegExp;
}

// Jobs bosun-x expects to see. `match` identifies the job in a crontab line.
const KNOWN_JOBS: JobDef[] = [
  { name: "fleet-backup", label: "Fleet backup", cadenceHours: 24, graceHours: 14, match: /fleet-backup\.sh(?![^\n]*--requests)/ },
  { name: "fleet-restore-test", label: "Restore test", cadenceHours: 24 * 7, graceHours: 48, match: /fleet-restore-test\.sh/ },
  { name: "fleet-secrets-backup", label: "Secrets bundle", cadenceHours: 24, graceHours: 14, match: /fleet-secrets-backup\.sh/ },
  { name: "fleet-offsite-push", label: "Off-site push", cadenceHours: 24, graceHours: 26, match: /fleet-offsite-push\.sh/ },
  { name: "control-room-data-backup", label: "Data-store backup", cadenceHours: 1, graceHours: 1, match: /control-room-data-backup\.sh/ },
];

// Recognised as part of a monitored job (so not "unmonitored"), but no heartbeat
// of its own — the fleet-backup request watcher that runs every couple of minutes.
const RECOGNISED_EXTRA = [/fleet-backup\.sh[^\n]*--requests/];

const jobsDir = () => path.join(receiptsDir(), "_jobs");

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
  return { capturedAt: raw.captured_at, cron: raw.cron ?? [], timers: raw.timers ?? [] };
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

  const jobs: JobStatus[] = await Promise.all(
    KNOWN_JOBS.map(async (def) => {
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

  const recognised = [...KNOWN_JOBS.map((d) => d.match), ...RECOGNISED_EXTRA];
  const unmonitored = cron.filter((l) => !recognised.some((re) => re.test(l)));

  return { jobs, unmonitored, snapshot, snapshotAgeHours };
}
