import Link from "next/link";
import { publicFleet, readActivity, type PublicCrew } from "@/lib/activity";
import { ActivityRefresh } from "@/components/activity-refresh";
import { CrewShip } from "@/components/crew-ship";
import { getJobStatuses } from "@/lib/data/jobs";
import { loadTasks } from "@/lib/data/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const tracked = [{ slug: "bosun-x", key: "BX" }, { slug: "bosun-x-dashboard", key: "BXD" }, { slug: "x-hakt", key: "XH" }];
  const [{ crew, events }, jobInfo, fleet, boards] = await Promise.all([
    readActivity(), getJobStatuses(), publicFleet(), Promise.all(tracked.map((project) => loadTasks(project.slug))),
  ]);
  const workOrders = tracked.flatMap((project, index) => boards[index]
    .filter((task) => task.status !== "done" && /^IDEA-20(?:\.|:)/.test(task.title))
    .map((task) => ({ ...task, project: project.slug, key: `${project.key}-${task.num}` })))
    .sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1));
  const liveCount = crew.filter((member) => !["finished", "unknown", "stale"].includes(member.state)).length;
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
  const shipCrew: PublicCrew[] = crew.filter((member) => member.state !== "finished" && member.state !== "unknown").slice(0, 8).map((member, i) => ({
    alias: `${member.provider === "codex" ? "Codex" : member.provider === "claude" ? "Claude" : "Crew"} ${i + 1}`,
    project: member.project || "Unmapped", state: member.state, updated: member.lastSeen,
    href: member.project ? `/projects/${encodeURIComponent(member.project)}${member.task ? `#${encodeURIComponent(member.task)}` : ""}` : undefined,
  }));
  return <div className="space-y-6">
    <ActivityRefresh />
    <div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Bosun · watch</p>
      <h1 className="text-2xl font-semibold mt-1">Crew activity</h1>
      <p className="text-sm text-muted-foreground mt-2">Session signals from Claude and Codex. A quiet or stale signal is never counted as active work.</p></div>
    <CrewShip crew={shipCrew} fleet={fleet} />
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="font-mono text-lg">Bring the crew online</h2>
      <p className="text-sm">{liveCount ? `${liveCount} live agent session${liveCount === 1 ? "" : "s"} observed.` : "No live agent session is being observed. The ship stays empty when every session has ended or its signal is older than five minutes."}
        {events[0] ? <> Last event: <time dateTime={events[0].at}>{new Date(events[0].at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</time>.</> : null}</p>
      <ol className="list-decimal pl-5 space-y-2 text-sm">
        <li>On dragonfly, open a terminal and run <code>codex</code>. At the <em>Codex prompt</em>, type <code>/hooks</code>, inspect the Bosun handlers, then choose Trust. This is not a website or a shell command. Repeat in a Codex session on Caspar after <code>ssh devserver</code>.</li>
        <li>Start a new Codex or Claude session inside a tracked project folder. To attach it to a specific work order, launch with <code>BOSUN_PROJECT=bosun-x BOSUN_TASK=BX-10 codex</code> (change both values for another project/task).</li>
        <li>Use the agent normally, then refresh this page. The session appears while its signal is fresh; the public crew includes only approved projects and broad status.</li>
      </ol>
      <p className="text-xs text-muted-foreground">Claude hooks are installed on dragonfly and Caspar. Melchior remains a separate rollout task because its SSH service is unreachable.</p>
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
