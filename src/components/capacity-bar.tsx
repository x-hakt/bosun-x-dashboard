import { COMFORT_RATIO, type CapacityBar, type CapacitySegment } from "@/lib/infra/capacity-core";
import { cn } from "@/lib/utils";

// Shared by the capacity panel (server) and the move simulator (client): segment
// colours, number formats and the stacked bar itself.

const PROJECT_BG: Record<string, string> = {
  Live: "bg-emerald-500/75",
  Development: "bg-sky-500/75",
  Paused: "bg-amber-500/75",
  Abandoned: "bg-zinc-500/75",
};

export function segmentBg(seg: CapacitySegment): string {
  switch (seg.kind) {
    case "project":
      return (seg.status && PROJECT_BG[seg.status]) || "bg-slate-400/70";
    case "unregistered":
      return "bg-orange-400/70";
    case "infra":
      return "bg-zinc-400/60";
    case "reclaimable":
      return "bg-violet-400/50";
    case "other":
      return "bg-zinc-600/70";
    case "free":
      return "bg-transparent";
  }
}

const GIB = 1024 ** 3;
export const fmtBytes = (b: number) => (b >= 100 * GIB ? `${(b / 1e9).toFixed(0)} GB` : b >= GIB ? `${(b / GIB).toFixed(1)} GiB` : `${(b / 1024 ** 2).toFixed(0)} MiB`);
// Disk in decimal GB, like df and the host cards.
export const fmtDisk = (b: number) => (b >= 10e9 ? `${(b / 1e9).toFixed(0)} GB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`);
export const fmtCores = (c: number) => `${c < 0.1 ? c.toFixed(2) : c.toFixed(1)} cores`;
export const pct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
export const fmtSpan = (hours: number) => (hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(hours < 10 ? 1 : 0)} h`);

// Hover text: on a history-based bar, the p95 the bar shows plus now and peak.
export function segmentTitle(seg: CapacitySegment, format: (v: number) => string): string {
  const n = seg.containers.length;
  const count = n ? ` (${n} container${n === 1 ? "" : "s"})` : "";
  if (!seg.stats) return `${seg.label}: ${format(seg.value)}${count}`;
  return `${seg.label}${count}: p95 ${format(seg.stats.p95)} · now ${format(seg.stats.current)} · peak ${format(seg.stats.peak)}`;
}

// A stacked bar of one resource. `bar.used` may exceed `bar.total` in a simulation
// (BXD-64); the bar then scales to the overflow and marks where capacity ends.
export function Bar({
  bar,
  format,
  height,
  label,
}: {
  bar: CapacityBar;
  format: (v: number) => string;
  height: string;
  label: string;
}) {
  const ratio = bar.total > 0 ? bar.used / bar.total : 0;
  const tone = ratio > 1 ? "text-destructive" : ratio > COMFORT_RATIO ? "text-amber-400" : "text-muted-foreground";
  const scale = Math.max(bar.total, bar.used);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono">
        <span className="text-foreground">{label}</span>
        <span className={tone}>
          {bar.basis === "p95" && "p95 "}
          {format(bar.used)} / {format(bar.total)} · {Math.round(ratio * 100)}%
          {bar.basis === "p95" && bar.liveUsed !== undefined && (
            <span className="text-muted-foreground"> · now {format(bar.liveUsed)}</span>
          )}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${format(bar.used)} of ${format(bar.total)} used`}
        className={cn("relative flex w-full overflow-hidden rounded-sm bg-muted/60", height)}
      >
        {bar.segments.map((seg) =>
          pct(seg.value, scale) > 0 ? (
            <div
              key={seg.key}
              title={(seg.incoming ? "Moving here: " : "") + segmentTitle(seg, format)}
              className={cn(
                "h-full shrink-0",
                segmentBg(seg),
                seg.kind !== "free" && "border-r border-background/80",
                seg.incoming && "outline outline-1 -outline-offset-1 outline-foreground",
              )}
              style={{
                width: `${pct(seg.value, scale)}%`,
                ...(seg.incoming && {
                  backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgb(0 0 0 / 0.35) 3px 6px)",
                }),
              }}
            />
          ) : null,
        )}
        <div
          aria-hidden
          className="absolute inset-y-0 border-l border-dashed border-foreground/60"
          style={{ left: `${pct(COMFORT_RATIO * bar.total, scale)}%` }}
        />
        {bar.used > bar.total && (
          <div aria-hidden className="absolute inset-y-0 border-l-2 border-destructive" style={{ left: `${pct(bar.total, scale)}%` }} />
        )}
      </div>
    </div>
  );
}
