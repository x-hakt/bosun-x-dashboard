import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { publicAllowlist, readActivity } from "@/lib/activity";
import { receiptsDir } from "@/lib/data/config";
import { localHostId } from "@/lib/data/hosts";
import { getJobStatuses } from "@/lib/data/jobs";
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

async function gatherSources(): Promise<PortSources> {
  const now = Date.now();
  const [{ events }, projects, jobs, history, carts, local] = await Promise.all([
    readActivity(EVENT_LIMIT),
    listProjects(),
    getJobStatuses().catch(() => ({ jobs: [] })),
    getCapacityHistory().catch(() => new Map()),
    recentCarts(),
    localHostId().catch(() => undefined),
  ]);
  const boards = await Promise.all(projects.map((p) => loadTasks(p.meta.slug).catch(() => [])));
  const commits = await recentCommits(projects.map((p) => ({ slug: p.meta.slug, path: p.meta.path, host: p.meta.host })), local, now - IN_PORT_MS);
  const deliveries: PortSources["deliveries"] = projects.flatMap((p, i) => boards[i]
    .filter((t) => t.status === "done" && Date.parse(t.updated) >= now - LOG_WINDOW_MS)
    .map((t) => ({ project: p.meta.slug, at: new Date(t.updated).toISOString(), id: `${p.meta.slug}#${t.id}` })));
  const tides = [...history.values()].flat().map((s: { t: string }) => s.t).filter((t: string) => Date.parse(t) >= now - HAPPENING_WINDOW_MS)
    .map((t: string) => new Date(Math.floor(Date.parse(t) / 60_000) * 60_000).toISOString());
  const chores: PortSources["chores"] = jobs.jobs.flatMap((job) => [
    ...(job.lastRun?.startedAt ? [{ id: `${job.name}:start:${job.lastRun.startedAt}`, at: job.lastRun.startedAt, outcome: "started" as const, label: job.label }] : []),
    ...(job.lastRun?.finishedAt ? [{ id: `${job.name}:finish:${job.lastRun.finishedAt}`, at: job.lastRun.finishedAt, outcome: job.lastRun.ok === false ? "failed" as const : "finished" as const, label: job.label }] : []),
  ]);
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
  };
}

export async function privatePortFeed(): Promise<PortFeed> {
  return buildPortFeed(await gatherSources(), { publicView: false });
}

// A per-process fallback keeps ids opaque even without AUTH_SECRET (they then change on restart).
const fallbackSecret = randomBytes(32).toString("hex");

export async function publicPortFeed(): Promise<PortFeed> {
  const { enabled, allProjects, projects } = await publicAllowlist();
  const empty: PortFeed = { now: Date.now(), publicView: true, ships: [], sailors: [], happenings: [], entries: [], log: { start: Date.now() - LOG_WINDOW_MS, end: Date.now(), groups: [], chores: [] } };
  if (!enabled) return empty;
  const sources = await gatherSources();
  const listed = new Set(projects.map((p) => p.slug));
  // Display names are the operator's own labels; keep them to the same safe character set.
  const everyone = allProjects ? sources.projects.filter((p) => !listed.has(p.slug)).map((p) => ({ slug: p.slug, alias: p.name.replace(/[^\w .-]/g, " ").trim().slice(0, 40) || p.slug })) : [];
  return buildPortFeed(sources, { publicView: true, approved: [...projects, ...everyone], secret: process.env.AUTH_SECRET || fallbackSecret });
}
