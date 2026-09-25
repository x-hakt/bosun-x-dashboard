import Link from "next/link";
import { readActivity, type PublicCrew, type PublicFleet } from "@/lib/activity";

type Signal = { host: string; provider: string; lastAt: string; fresh: boolean; events: number; unmapped: number };

// BXD-83: where signals come from, one row per host × provider, so a quiet machine is visible.
function signalSources(events: { host: string | null; provider: string; project: string | null; at: string }[]): Signal[] {
  const now = Date.now();
  const rows = new Map<string, Signal>();
  for (const e of events) {
    const host = e.host || "unknown host";
    const row = rows.get(`${host}\u0000${e.provider}`) ?? { host, provider: e.provider, lastAt: e.at, fresh: false, events: 0, unmapped: 0 };
    if (e.at > row.lastAt) row.lastAt = e.at;
    row.events += 1;
    if (!e.project) row.unmapped += 1;
    rows.set(`${host}\u0000${e.provider}`, row);
  }
  return [...rows.values()].map((r) => ({ ...r, fresh: now - Date.parse(r.lastAt) < 5 * 60_000 })).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
// The page's one clock read, outside the component body (react-hooks/purity).
function clockNow() {
  const now = Date.now();
  return { now, dayAgo: now - 24 * 3_600_000 };
}
import { ActivityRefresh } from "@/components/activity-refresh";
import { CrewShip } from "@/components/crew-ship";
import { ShipLogTimeline, type ChoreMark } from "@/components/ship-log";
import { buildShipLog } from "@/lib/activity-state";
import { getJobStatuses } from "@/lib/data/jobs";
import { loadTasks } from "@/lib/data/tasks";
import { listProjects } from "@/lib/data/projects";
import { taskDisplayKey, taskPrefix } from "@/lib/data/task-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const [{ crew, events }, jobInfo, projects] = await Promise.all([readActivity(), getJobStatuses(), listProjects()]);
  // BXD-83: IDEA-20 work orders can live on any board, so scan them all.
  const boards = await Promise.all(projects.map((project) => loadTasks(project.meta.slug).catch(() => [])));
  const workOrders = projects.flatMap((project, index) => boards[index]
    .filter((task) => task.status !== "done" && /^IDEA-20(?:\.|:)/.test(task.title))
    .map((task) => ({ ...task, project: project.meta.slug, key: taskDisplayKey(task, boards[index], taskPrefix(project.meta)) ?? task.id })))
    .sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1));
  const sources = signalSources(events);
  // BXD-84: the last day as per-session lanes, replayed with the roster's own rules.
  const { now, dayAgo } = clockNow();
  const shipLog = buildShipLog(events, { start: dayAgo, end: now });
  const oldestLoaded = events.length ? Date.parse(events[events.length - 1].at) : now;
  const truncatedSince = events.length >= 2000 && oldestLoaded > shipLog.start ? oldestLoaded : undefined;
  const chores: ChoreMark[] = jobInfo.jobs.flatMap((job) => [
    ...(job.lastRun?.startedAt ? [{ id: `${job.name}:start`, at: Date.parse(job.lastRun.startedAt), label: job.label, outcome: "started" as const }] : []),
    ...(job.lastRun?.finishedAt ? [{ id: `${job.name}:finish`, at: Date.parse(job.lastRun.finishedAt), label: job.label, outcome: job.lastRun.ok === false ? "failed" as const : "finished" as const }] : []),
  ]);
  const jobEvents = jobInfo.jobs.flatMap((job) => {
    const entries: { id: string; at: string; label: string; source: string; context: string }[] = [];
    if (job.lastRun?.startedAt) entries.push({ id: `${job.name}:start:${job.lastRun.startedAt}`, at: job.lastRun.startedAt, label: "started", source: job.label, context: "scheduled job" });
    if (job.lastRun?.finishedAt) entries.push({ id: `${job.name}:finish:${job.lastRun.finishedAt}`, at: job.lastRun.finishedAt, label: job.lastRun.ok === false ? "failed" : "finished", source: job.label, context: "scheduled job" });
    return entries;
  });
  const timeline = [
    ...events.map((event) => ({ id: event.id, at: event.at, label: event.kind.replaceAll("_", " "), source: event.provider, context: event.project || "unmapped" })),
    ...jobEvents,
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  const counts = new Map<string, number>();
  const shipCrew: (PublicCrew & { href?: string; sub?: boolean })[] = crew.filter((member) => member.state !== "finished" && member.state !== "unknown").slice(0, 24).map((member) => {
    const name = member.provider === "codex" ? "Codex" : member.provider === "claude" ? "Claude" : "Crew";
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return {
    alias: `${name} ${counts.get(name)}`, sub: Boolean(member.parent),
    project: member.project || "Unmapped", state: member.state, updated: member.lastSeen,
    href: member.project ? `/projects/${encodeURIComponent(member.project)}${member.task ? `#${encodeURIComponent(member.task)}` : ""}` : undefined,
    };
  });
  // The private fleet uses real slugs (the public one uses approved aliases): every board with
  // crew aboard, or a session seen in the last 3 hours (BXD-82: moored in the harbour).
  const recent = new Set(crew.filter((member) => member.project && now - Date.parse(member.lastSeen) < 3 * 3_600_000).map((member) => member.project));
  const fleet: PublicFleet[] = projects.flatMap((project, index) => shipCrew.some((member) => member.project === project.meta.slug) || recent.has(project.meta.slug)
    ? [{ project: project.meta.slug, todo: boards[index].filter((task) => task.status === "todo").length, inProgress: boards[index].filter((task) => task.status === "in_progress").length }]
    : []);
  return <div className="space-y-6">
    <ActivityRefresh />
    <div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Bosun · watch</p>
      <h1 className="text-2xl font-semibold mt-1">Crew activity</h1>
      <p className="text-sm text-muted-foreground mt-2">Session signals from Claude and Codex. A quiet or stale signal is never counted as active work.</p></div>
    <CrewShip crew={shipCrew} fleet={fleet} />
    <ShipLogTimeline log={shipLog} chores={chores} truncatedSince={truncatedSince} />
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="font-mono text-lg">Signal sources</h2>
      {sources.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sources.map((src) => <article key={`${src.host}:${src.provider}`} className="rounded-md border border-border p-3 text-sm">
        <div className="flex justify-between gap-2"><strong className="font-mono">{src.host}</strong><span className={src.fresh ? "text-emerald-400" : "text-muted-foreground"}>{src.fresh ? "fresh" : "quiet"}</span></div>
        <p className="capitalize mt-1">{src.provider}</p>
        <p className="text-xs text-muted-foreground mt-1">Last event <time dateTime={src.lastAt}>{new Date(src.lastAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</time> · {src.events} recent{src.unmapped ? ` · ${src.unmapped} unmapped` : ""}</p>
      </article>)}</div> : <p className="text-sm text-muted-foreground">No signals yet. Add the Claude or Codex lifecycle hook (<code>hooks/activity.mjs</code>) on each machine; see <code>docs/activity.md</code>.</p>}
      <p className="text-xs text-muted-foreground">Fresh means an event in the last five minutes. Unmapped events have no project; start sessions inside a tracked project folder, or set <code>BOSUN_PROJECT</code> and <code>BOSUN_TASK</code>.</p>
    </section>
    <section><h2 className="font-mono text-lg mb-3">IDEA-20 work orders</h2>
      <div className="grid gap-2">{workOrders.length ? workOrders.map((task) => <Link key={`${task.project}:${task.id}`} href={`/projects/${task.project}#${task.key}`} className="rounded-lg border border-border bg-card p-3 hover:border-primary flex flex-wrap justify-between gap-2 text-sm">
        <span><strong className="font-mono">{task.key}</strong> · {task.title}</span><span className="text-muted-foreground">{task.status.replaceAll("_", " ")}</span>
      </Link>) : <p className="text-sm text-muted-foreground">All tracked IDEA-20 work orders are complete.</p>}</div>
    </section>
    <section><h2 className="font-mono text-lg mb-3">Sessions</h2>
      <div className="grid gap-2">{crew.length ? crew.map((member) => <article key={member.key} className="rounded-lg border border-border bg-card p-3 flex flex-wrap justify-between gap-3">
        <div><strong className="capitalize">{member.provider}</strong> <span className="text-xs text-muted-foreground font-mono">{member.key.split(":")[1].slice(0, 12)}</span>
          <p className="text-sm mt-1">{member.project ? <Link className="underline" href={`/projects/${member.project}`}>{member.project}</Link> : "Unmapped project"}{member.task && member.project ? <> · <Link className="underline" href={`/projects/${member.project}#${member.task}`}>{member.task}</Link></> : null}</p></div>
        <div className="text-right text-sm"><span className={member.state === "needs_approval" ? "text-amber-400" : member.state === "stale" ? "text-muted-foreground" : "text-foreground"}>{member.state.replaceAll("_", " ")}</span>
          <p className="text-xs text-muted-foreground mt-1">Last observed <time dateTime={member.lastSeen}>{new Date(member.lastSeen).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</time></p></div>
      </article>) : <p className="text-sm text-muted-foreground">No activity recorded yet. Install a provider hook or use the <code>bosun event</code> command.</p>}</div></section>
    <section><h2 className="font-mono text-lg mb-3">Ship&apos;s chores</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{jobInfo.jobs.map((job) => <article key={job.name} className="rounded-lg border border-border bg-card p-3 text-sm">
        <div className="flex justify-between gap-2"><strong>{job.label}</strong><span className={job.state === "failed" || job.state === "stalled" || job.state === "overdue" ? "text-amber-400" : "text-muted-foreground"}>{job.state}</span></div>
        <p className="text-xs text-muted-foreground mt-1">{job.lastRun?.finishedAt ? `Last finished ${new Date(job.lastRun.finishedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}` : "Awaiting first completed run"}</p>
      </article>)}</div>
      <p className="text-xs text-muted-foreground mt-2">Job states come from run markers, separate from agent sessions. <Link className="underline" href="/backups">Backup details</Link></p>
    </section>
    <section><h2 className="font-mono text-lg mb-3">Recent events</h2>
      <ol className="space-y-1 text-sm">{timeline.map((event) => <li className="flex flex-wrap gap-x-3 border-b border-border/50 py-1" key={event.id}>
        <time className="font-mono text-muted-foreground" dateTime={event.at}>{new Date(event.at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</time>
        <span className="capitalize">{event.source}</span><span>{event.label}</span><span className="text-muted-foreground">{event.context}</span>
      </li>)}</ol></section>
  </div>;
}
