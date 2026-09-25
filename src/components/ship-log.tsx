import Link from "next/link";
import type { CrewState, LogLane, LogSegment, ShipLog } from "@/lib/activity-state";
import { cn } from "@/lib/utils";

// IDEA-20 (BXD-84): the ship's log. One lane per session over the last day, grouped by
// project, bars coloured by observed state; scheduled jobs as markers; the right edge of
// every track is now. Server-rendered, private page only.

export interface ChoreMark {
  id: string;
  at: number;
  label: string; // job name
  outcome: "started" | "finished" | "failed";
}

const TZ = "Australia/Sydney";
const HOUR = 3_600_000;

const STATE_LABEL: Record<CrewState, string> = {
  working: "working", waiting_for_tool: "tool running", needs_approval: "needs approval",
  ready_for_prompt: "ready", stale: "signal stale", finished: "finished", unknown: "no signal",
};
const BAR: Record<LogSegment["state"], string> = {
  working: "bg-emerald-500",
  waiting_for_tool: "bg-sky-500",
  needs_approval: "bg-amber-400",
  ready_for_prompt: "bg-violet-400/80",
  stale: "bg-[repeating-linear-gradient(135deg,rgb(113_113_122/.55)_0_3px,transparent_3px_6px)]",
};
const STATE_TEXT: Partial<Record<CrewState, string>> = { needs_approval: "text-amber-400", stale: "text-muted-foreground", unknown: "text-muted-foreground", finished: "text-muted-foreground" };

const clock = (t: number) => new Date(t).toLocaleTimeString("en-AU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const span = (ms: number) => (ms >= HOUR ? `${(ms / HOUR).toFixed(1)} h` : `${Math.max(1, Math.round(ms / 60_000))} min`);

function Track({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("relative h-4 rounded-sm bg-muted/40 border-r-2 border-primary/70", className)}>{children}</div>;
}

const left = (log: ShipLog, t: number) => `${((t - log.start) / (log.end - log.start)) * 100}%`;
const width = (log: ShipLog, a: number, b: number) => `${((b - a) / (log.end - log.start)) * 100}%`;

function LaneRow({ log, lane, depth }: { log: ShipLog; lane: LogLane; depth: number }) {
  const short = lane.session.slice(0, 12);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] items-center gap-x-3 gap-y-1 py-1">
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs" style={{ paddingLeft: `${depth * 0.9}rem` }}>
        <span className="min-w-0 truncate" title={`${lane.provider} ${lane.session}${lane.task ? ` · ${lane.task}` : ""}`}>
          {depth > 0 && <span className="text-muted-foreground">↳ </span>}
          <span className="capitalize">{lane.provider}</span> <span className="font-mono text-muted-foreground">{short}</span>
          {lane.task && <span className="font-mono"> · {lane.task}</span>}
        </span>
        <span className={cn("shrink-0", STATE_TEXT[lane.state])}>{STATE_LABEL[lane.state]}</span>
      </div>
      <Track>
        {lane.segments.map((s) => (
          <span
            key={`${s.state}-${s.from}`}
            title={`${STATE_LABEL[s.state]} ${clock(s.from)}–${clock(s.to)} (${span(s.to - s.from)})`}
            className={cn("absolute inset-y-0 min-w-[2px] rounded-[2px]", BAR[s.state])}
            style={{ left: left(log, s.from), width: width(log, s.from, s.to) }}
          />
        ))}
      </Track>
    </div>
  );
}

export function ShipLogTimeline({ log, chores, truncatedSince }: { log: ShipLog; chores: ChoreMark[]; truncatedSince?: number }) {
  const ticks: number[] = [];
  // Hour ticks every 3 h; none within ~45 min of the end, where the "now" label sits.
  for (let t = Math.ceil(log.start / (3 * HOUR)) * 3 * HOUR; t < log.end - 0.75 * HOUR; t += 3 * HOUR) ticks.push(t);
  const marks = chores.filter((c) => c.at >= log.start && c.at <= log.end);
  const depthOf = (lane: LogLane, lanes: LogLane[]): number => {
    const parent = lanes.find((l) => l.session === lane.parent && l !== lane);
    return parent ? Math.min(3, 1 + depthOf(parent, lanes.filter((l) => l !== lane))) : 0;
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-labelledby="ship-log-title">
      <div>
        <h2 id="ship-log-title" className="font-mono text-lg">Ship&apos;s log</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Last 24 hours, one lane per session. The right edge is now. Silence turns a bar to hatched (stale) after five
          minutes and ends it after an hour.
          {truncatedSince !== undefined && ` Only events since ${clock(truncatedSince)} were loaded.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        {(Object.keys(BAR) as LogSegment["state"][]).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className={cn("inline-block h-2.5 w-4 rounded-[2px]", BAR[s])} />{STATE_LABEL[s]}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-foreground/80" />scheduled job</span>
      </div>

      {log.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions in the last 24 hours.</p>
      ) : (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-3" aria-hidden="true">
            <span className="hidden sm:block" />
            <div className="relative h-5 text-[10px] font-mono text-muted-foreground">
              {ticks.map((t, i) => (
                <span key={t} className={cn("absolute -translate-x-1/2", i % 2 ? "hidden sm:block" : "")} style={{ left: left(log, t) }}>{clock(t)}</span>
              ))}
              <span className="absolute right-0 text-primary">now</span>
            </div>
          </div>

          {log.groups.map((group) => (
            <div key={group.project ?? "\u0000unmapped"} className="border-t border-border/50 pt-2 mt-1">
              <div className="text-sm font-mono mb-0.5">
                {group.project ? <Link className="hover:underline" href={`/projects/${group.project}`}>{group.project}</Link> : <span className="text-muted-foreground">Unmapped</span>}
              </div>
              {group.lanes.map((lane) => <LaneRow key={lane.key} log={log} lane={lane} depth={depthOf(lane, group.lanes)} />)}
            </div>
          ))}

          {marks.length > 0 && (
            <div className="border-t border-border/50 pt-2 mt-1 grid grid-cols-1 sm:grid-cols-[13rem_1fr] items-center gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">Ship&apos;s chores</span>
              <Track>
                {marks.map((m) => (
                  <span
                    key={m.id}
                    title={`${m.label} ${m.outcome} ${clock(m.at)}`}
                    className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45", m.outcome === "failed" ? "bg-destructive" : m.outcome === "started" ? "bg-foreground/50" : "bg-foreground/80")}
                    style={{ left: left(log, m.at) }}
                  />
                ))}
              </Track>
            </div>
          )}
        </div>
      )}

      <ol className="sr-only">
        {log.groups.flatMap((g) => g.lanes).map((lane) => (
          <li key={lane.key}>
            {lane.provider} {lane.session.slice(0, 12)} on {lane.project ?? "an unmapped project"}: {lane.segments.map((s) => `${STATE_LABEL[s.state]} ${clock(s.from)} to ${clock(s.to)}`).join(", ") || "no bars in the window"}; now {STATE_LABEL[lane.state]}.
          </li>
        ))}
      </ol>
    </section>
  );
}
