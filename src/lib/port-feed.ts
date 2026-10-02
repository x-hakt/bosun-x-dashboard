import { execFile } from "node:child_process";
import { isDemo } from "@/lib/demo";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { publicAllowlist, readActivity } from "@/lib/activity";
import { receiptsDir } from "@/lib/data/config";
import { openNotifications } from "@/lib/data/notifications";
import { localHostId } from "@/lib/data/hosts";
import { getJobRuns, getJobStatuses } from "@/lib/data/jobs";
import { displayName } from "@/lib/data/project-display";
import { listProjects } from "@/lib/data/projects";
import { loadTasks } from "@/lib/data/tasks";
import { getCapacityHistory } from "@/lib/infra/capacity-history";
import { cached } from "@/lib/util/ttl-cache";
import { buildPortFeed, HAPPENING_WINDOW_MS, IN_PORT_MS, LOG_WINDOW_MS, type PortFeed, type PortSources } from "@/lib/port-core";

// IDEA-20 (BXD-85..87): gathers the port's real sources, then hands them to the pure
// builder in port-core.ts. Everything slow (git, receipts, capacity history) is cached, so
// the pages' 10-second refresh stays cheap.

const execFileAsync = promisify(execFile);
const EVENT_LIMIT = 2000;

// Commits in each local project's repo since the port window opened. Projects sharing a
// checkout count it once (the first by slug).
async function recentCommits(projects: { slug: string; path?: string | null; host?: string | null }[], local: string | undefined, since: number) {
  if (isDemo()) return []; // BXD-109: sample paths are fictional; never run git here
  const seen = new Set<string>();
  const out: PortSources["commits"] = [];
  for (const p of [...projects].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!p.path || (p.host && local && p.host !== local) || seen.has(p.path)) continue;
    seen.add(p.path);
    const lines = await cached(`port:git:${p.path}`, 60_000, async () => {
      try {
        const { stdout } = await execFileAsync("git", ["-C", p.path!, "log", "--all", `--since=${new Date(since).toISOString()}`, "--format=%H %cI"], { timeout: 5_000 });
        return stdout.split("\n").filter(Boolean);
      } catch {
        return [];
      }
    });
    for (const line of lines) {
      const [id, at] = line.split(" ");
      if (id && at) out.push({ project: p.slug, id, at: new Date(at).toISOString() });
    }
  }
  return out;
}

// Backup runs: each store's newest receipt (<receipts>/<project>/<store>.latest.json).
async function recentCarts(): Promise<PortSources["carts"]> {
  return cached("port:carts", 60_000, async () => {
    const root = receiptsDir();
    const out: PortSources["carts"] = [];
    const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith("_")) continue;
      const files = await fs.readdir(path.join(root, dir.name)).catch(() => []);
      for (const file of files.filter((f) => f.endsWith(".latest.json"))) {
        try {
          const receipt = JSON.parse(await fs.readFile(path.join(root, dir.name, file), "utf8")) as { finished_at?: string; store?: string };
          if (receipt.finished_at) out.push({ project: dir.name, at: new Date(receipt.finished_at).toISOString(), id: `${dir.name}/${receipt.store ?? file}@${receipt.finished_at}` });
        } catch {
          /* a half-written receipt is skipped */
        }
      }
    }
    return out;
  });
}

// BXD-105: container starts and crashes on this host (scripts/container-events.sh), mapped to
// projects through project.yml `containers`. Containers no project claims are left out.
async function recentRefits(owners: Map<string, string>, since: number): Promise<PortSources["refits"]> {
  const lines = await cached("port:containers", 60_000, async () => {
    try {
      return (await fs.readFile(path.join(receiptsDir(), "_events", "containers.jsonl"), "utf8")).split("\n");
    } catch {
      return [];
    }
  });
  const out: PortSources["refits"] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { at?: string; container?: string; action?: string; exit?: number | null };
      const project = e.container ? owners.get(e.container) : undefined;
      if (!project || !e.at || !(Date.parse(e.at) >= since) || (e.action !== "start" && e.action !== "crash")) continue;
      out.push({ project, at: new Date(e.at).toISOString(), id: `${e.container}:${e.action}:${e.at}`, action: e.action, container: e.container! });
    } catch {
      /* a torn line is skipped */
    }
  }
  return out;
}

// BXD-96: restore drills. fleet-restore-test.sh appends one line per store tested to
// <receipts>/<project>/<store>.restore-log.jsonl ({store, tested_at, ok, ...}).
async function recentDives(since: number): Promise<NonNullable<PortSources["dives"]>> {
  if (isDemo()) return [];
  const all = await cached("port:dives", 60_000, async () => {
    const root = receiptsDir();
    const out: NonNullable<PortSources["dives"]> = [];
    const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith("_")) continue;
      const files = await fs.readdir(path.join(root, dir.name)).catch(() => []);
      for (const file of files.filter((f) => f.endsWith(".restore-log.jsonl"))) {
        const text = await fs.readFile(path.join(root, dir.name, file), "utf8").catch(() => "");
        for (const line of text.split("\n").slice(-60)) {
          if (!line.trim()) continue;
          try {
            const r = JSON.parse(line) as { store?: string; tested_at?: string; ok?: boolean };
            if (!r.tested_at || !Date.parse(r.tested_at)) continue;
            const store = r.store ?? file.replace(/\.restore-log\.jsonl$/, "");
            out.push({ project: dir.name, at: new Date(r.tested_at).toISOString(), id: `${dir.name}/${store}:restore:${r.tested_at}`, store, ok: r.ok === true });
          } catch {
            /* a torn line is skipped */
          }
        }
      }
    }
    return out;
  });
  return all.filter((d) => Date.parse(d.at) >= since);
}

// BXD-96 the press: lines the content planner appends to <receipts>/_events/press.jsonl.
async function recentPress(since: number): Promise<NonNullable<PortSources["press"]>> {
  if (isDemo()) return [];
  const lines = await cached("port:press", 60_000, async () => {
    try {
      return (await fs.readFile(path.join(receiptsDir(), "_events", "press.jsonl"), "utf8")).split("\n").slice(-4000);
    } catch {
      return [];
    }
  });
  const kinds = new Set(["card", "draft", "article", "published", "site"]);
  const out: NonNullable<PortSources["press"]> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { at?: string; kind?: string; project?: string | null; provider?: string | null; id?: string };
      if (!e.at || !(Date.parse(e.at) >= since) || !e.kind || !kinds.has(e.kind)) continue;
      out.push({ project: e.project ?? null, at: new Date(e.at).toISOString(), id: `press:${e.id ?? `${e.kind}:${e.at}`}`, kind: e.kind as NonNullable<PortSources["press"]>[number]["kind"], provider: e.provider ?? null });
    } catch {
      /* a torn line is skipped */
    }
  }
  return out;
}

// BXD-112: unclean reboots of this host from scripts/boot-check.mjs. Only the time and how long
// it was down leave this function; the host and boot ids stay behind.
async function recentSqualls(since: number): Promise<NonNullable<PortSources["squalls"]>> {
  if (isDemo()) return [];
  const lines = await cached("port:reboots", 60_000, async () => {
    try {
      return (await fs.readFile(path.join(receiptsDir(), "_events", "reboots.jsonl"), "utf8")).split("\n").slice(-500);
    } catch {
      return [];
    }
  });
  const out: NonNullable<PortSources["squalls"]> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as { at?: string; clean?: boolean; down_s?: number };
      if (r.clean !== false || !r.at || !(Date.parse(r.at) >= since)) continue;
      const at = new Date(r.at).toISOString();
      out.push({ at, id: `squall:${at}`, downS: Math.max(0, Math.round(Number(r.down_s) || 0)) });
    } catch {
      /* a torn line is skipped */
    }
  }
  return out;
}

async function gatherSources(): Promise<PortSources> {
  const now = Date.now();
  const [{ events }, projects, jobs, runs, history, carts, local] = await Promise.all([
    readActivity(EVENT_LIMIT),
    listProjects(),
    getJobStatuses().catch(() => ({ jobs: [] })),
    cached("port:job-runs", 30_000, () => getJobRuns(now - LOG_WINDOW_MS)).catch(() => []),
    getCapacityHistory().catch(() => new Map()),
    recentCarts(),
    localHostId().catch(() => undefined),
  ]);
  const boards = await Promise.all(projects.map((p) => loadTasks(p.meta.slug).catch(() => [])));
  // BXD-104: every start / checkpoint / finish already sits in each project's HANDOFF.yml trail.
  const logbook: PortSources["logbook"] = projects.flatMap((p) => (p.handoffState?.trail ?? [])
    .filter((t) => t.at && Date.parse(t.at) >= now - LOG_WINDOW_MS && Date.parse(t.at) <= now)
    .map((t) => ({ project: p.meta.slug, at: new Date(t.at!).toISOString(), id: `${p.meta.slug}:handoff:${t.at}`, kind: t.kind ?? "checkpoint", agent: t.agent ?? "", work: t.work ?? "" })));
  const owners = new Map<string, string>();
  for (const p of projects) for (const c of [p.meta.container, ...(p.meta.containers ?? [])]) if (c?.compose_service && !owners.has(c.compose_service)) owners.set(c.compose_service, p.meta.slug);
  const refits = await recentRefits(owners, now - LOG_WINDOW_MS);
  const dives = await recentDives(now - LOG_WINDOW_MS);
  const press = await recentPress(now - LOG_WINDOW_MS);
  const squalls = await recentSqualls(now - LOG_WINDOW_MS);
  const needsYou = (await openNotifications()).length;
  const commits = await recentCommits(projects.map((p) => ({ slug: p.meta.slug, path: p.meta.path, host: p.meta.host })), local, now - IN_PORT_MS);
  const deliveries: PortSources["deliveries"] = projects.flatMap((p, i) => boards[i]
    .filter((t) => t.status === "done" && Date.parse(t.updated) >= now - LOG_WINDOW_MS)
    .map((t) => ({ project: p.meta.slug, at: new Date(t.updated).toISOString(), id: `${p.meta.slug}#${t.id}` })));
  const tides = [...history.values()].flat().map((s: { t: string }) => s.t).filter((t: string) => Date.parse(t) >= now - HAPPENING_WINDOW_MS)
    .map((t: string) => new Date(Math.floor(Date.parse(t) / 60_000) * 60_000).toISOString());
  // BXD-94: every run from the run history; a job's last-run marker fills in for jobs whose
  // runs predate the history, and a job running right now adds its start.
  const chores: PortSources["chores"] = runs.map((r) => ({ id: `${r.job}:finish:${r.finishedAt}`, at: r.finishedAt, outcome: r.ok ? "finished" as const : "failed" as const, label: r.label, job: r.job, family: r.family }));
  const logged = new Set(chores.map((c) => c.id));
  for (const job of jobs.jobs) {
    const last = job.lastRun;
    if (last?.finishedAt && !logged.has(`${job.name}:finish:${last.finishedAt}`)) chores.push({ id: `${job.name}:finish:${last.finishedAt}`, at: last.finishedAt, outcome: last.ok === false ? "failed" : "finished", label: job.label, job: job.name, family: job.family });
    if (job.state === "running" && job.runningForHours !== undefined) {
      const at = new Date(now - job.runningForHours * 3_600_000).toISOString();
      chores.push({ id: `${job.name}:start:${at}`, at, outcome: "started", label: job.label, job: job.name, family: job.family });
    }
  }
  // The capacity sampler is already the shipwright's tide reading; everything else is an errand.
  const errands: PortSources["errands"] = runs
    .filter((r) => r.job !== "capacity-sample")
    .map((r) => ({ id: `${r.job}:run:${r.finishedAt}`, at: r.finishedAt, job: r.job, label: r.label, family: r.family, ok: r.ok }));
  return {
    now,
    events,
    eventsTruncated: events.length >= EVENT_LIMIT,
    projects: projects.map((p, i) => ({
      slug: p.meta.slug,
      name: displayName(p.meta),
      todo: boards[i].filter((t) => t.status === "todo" || t.status === "backlog").length,
      inProgress: boards[i].filter((t) => t.status === "in_progress").length,
    })),
    commits,
    deliveries,
    carts,
    tides,
    chores,
    errands,
    logbook,
    refits,
    dives,
    press,
    squalls,
    needsYou,
  };
}

export async function privatePortFeed(): Promise<PortFeed> {
  return buildPortFeed(await gatherSources(), { publicView: false });
}

// A per-process fallback keeps ids opaque even without AUTH_SECRET (they then change on restart).
const fallbackSecret = randomBytes(32).toString("hex");

export async function publicPortFeed(): Promise<PortFeed> {
  const { enabled, allProjects, projects } = await publicAllowlist();
  const empty: PortFeed = { now: Date.now(), publicView: true, ships: [], sailors: [], needsYou: 0, happenings: [], entries: [], log: { start: Date.now() - LOG_WINDOW_MS, end: Date.now(), groups: [], chores: [] } };
  if (!enabled) return empty;
  const sources = await gatherSources();
  const listed = new Set(projects.map((p) => p.slug));
  // Display names are the operator's own labels; keep them to the same safe character set.
  const everyone = allProjects ? sources.projects.filter((p) => !listed.has(p.slug)).map((p) => ({ slug: p.slug, alias: p.name.replace(/[^\w .-]/g, " ").trim().slice(0, 40) || p.slug })) : [];
  return buildPortFeed(sources, { publicView: true, approved: [...projects, ...everyone], secret: process.env.AUTH_SECRET || fallbackSecret });
}
