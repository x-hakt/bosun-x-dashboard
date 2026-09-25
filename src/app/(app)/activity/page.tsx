import Link from "next/link";
import { readActivity, type PublicCrew } from "@/lib/activity";
import { ActivityRefresh } from "@/components/activity-refresh";
import { CrewShip } from "@/components/crew-ship";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { crew, events } = await readActivity();
  const shipCrew: PublicCrew[] = crew.filter((member) => member.state !== "finished" && member.state !== "unknown").slice(0, 8).map((member, i) => ({
    alias: `${member.provider === "codex" ? "Codex" : member.provider === "claude" ? "Claude" : "Crew"} ${i + 1}`,
    project: member.project || "Unmapped", state: member.state, updated: member.lastSeen,
  }));
  return <div className="space-y-6">
    <ActivityRefresh />
    <div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Bosun · watch</p>
      <h1 className="text-2xl font-semibold mt-1">Crew activity</h1>
      <p className="text-sm text-muted-foreground mt-2">Session signals from Claude and Codex. A quiet or stale signal is never counted as active work.</p></div>
    <CrewShip crew={shipCrew} />
    <section><h2 className="font-mono text-lg mb-3">Sessions</h2>
      <div className="grid gap-2">{crew.length ? crew.map((member) => <article key={member.key} className="rounded-lg border border-border bg-card p-3 flex flex-wrap justify-between gap-3">
        <div><strong className="capitalize">{member.provider}</strong> <span className="text-xs text-muted-foreground font-mono">{member.key.split(":")[1].slice(0, 12)}</span>
          <p className="text-sm mt-1">{member.project ? <Link className="underline" href={`/projects/${member.project}`}>{member.project}</Link> : "Unmapped project"}{member.task ? ` · ${member.task}` : ""}</p></div>
        <div className="text-right text-sm"><span className={member.state === "needs_approval" ? "text-amber-400" : member.state === "stale" ? "text-muted-foreground" : "text-foreground"}>{member.state.replaceAll("_", " ")}</span>
          <p className="text-xs text-muted-foreground mt-1">Last observed <time dateTime={member.lastSeen}>{new Date(member.lastSeen).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</time></p></div>
      </article>) : <p className="text-sm text-muted-foreground">No activity recorded yet. Install a provider hook or use the <code>bosun event</code> command.</p>}</div></section>
    <section><h2 className="font-mono text-lg mb-3">Recent events</h2>
      <ol className="space-y-1 text-sm">{events.slice(0, 40).map((event) => <li className="flex flex-wrap gap-x-3 border-b border-border/50 py-1" key={event.id}>
        <time className="font-mono text-muted-foreground" dateTime={event.at}>{new Date(event.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney" })}</time>
        <span className="capitalize">{event.provider}</span><span>{event.kind.replaceAll("_", " ")}</span><span className="text-muted-foreground">{event.project || "unmapped"}</span>
      </li>)}</ol></section>
  </div>;
}
