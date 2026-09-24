import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHostCapacities, COMFORT_RATIO, MIN_HISTORY_HOURS, type CapacityBar, type CapacitySegment, type HostCapacity } from "@/lib/infra/capacity";
import { cn } from "@/lib/utils";

// BXD-61: "will it fit?" at a glance. One card per server host; each resource is a
// bar of the host's full capacity, split into the projects using it, then unregistered
// and shared containers, then whatever the host itself uses, then free space. RAM is
// the primary bar (it's the constraint that matters most here).

const PROJECT_BG: Record<string, string> = {
  Live: "bg-emerald-500/75",
  Development: "bg-sky-500/75",
  Paused: "bg-amber-500/75",
  Abandoned: "bg-zinc-500/75",
};

function segmentBg(seg: CapacitySegment): string {
  switch (seg.kind) {
    case "project":
      return (seg.status && PROJECT_BG[seg.status]) || "bg-slate-400/70";
    case "unregistered":
      return "bg-orange-400/70";
    case "infra":
      return "bg-zinc-400/60";
    case "other":
      return "bg-zinc-600/70";
    case "free":
      return "bg-transparent";
  }
}

const GIB = 1024 ** 3;
const fmtBytes = (b: number) => (b >= 100 * GIB ? `${(b / 1e9).toFixed(0)} GB` : b >= GIB ? `${(b / GIB).toFixed(1)} GiB` : `${(b / 1024 ** 2).toFixed(0)} MiB`);
const fmtCores = (c: number) => `${c < 0.1 ? c.toFixed(2) : c.toFixed(1)} cores`;
const pct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
const fmtSpan = (hours: number) => (hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(hours < 10 ? 1 : 0)} h`);

// Hover text: on a history-based bar, the p95 the bar shows plus now and peak.
function segmentTitle(seg: CapacitySegment, format: (v: number) => string): string {
  const n = seg.containers.length;
  const count = n ? ` (${n} container${n === 1 ? "" : "s"})` : "";
  if (!seg.stats) return `${seg.label}: ${format(seg.value)}${count}`;
  return `${seg.label}${count}: p95 ${format(seg.stats.p95)} · now ${format(seg.stats.current)} · peak ${format(seg.stats.peak)}`;
}

function Bar({
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
          pct(seg.value, bar.total) > 0 ? (
            <div
              key={seg.key}
              title={segmentTitle(seg, format)}
              className={cn("h-full shrink-0", segmentBg(seg), seg.kind !== "free" && "border-r border-background/80")}
              style={{ width: `${pct(seg.value, bar.total)}%` }}
            />
          ) : null,
        )}
        <div
          aria-hidden
          className="absolute inset-y-0 border-l border-dashed border-foreground/60"
          style={{ left: `${COMFORT_RATIO * 100}%` }}
        />
      </div>
    </div>
  );
}

function DiskBar({ disk }: { disk: NonNullable<HostCapacity["disk"]> }) {
  const bar: CapacityBar = {
    basis: "snapshot",
    total: disk.total,
    used: disk.used,
    segments: [
      { key: "used", kind: "other", label: "Used (per-project split: BXD-65/66)", value: disk.used, containers: [] },
      { key: "free", kind: "free", label: "Free", value: Math.max(0, disk.total - disk.used), containers: [] },
    ],
  };
  return <Bar bar={bar} format={(b) => `${(b / 1e9).toFixed(0)} GB`} height="h-2" label="Disk" />;
}

function Legend({ bar }: { bar: CapacityBar }) {
  const shown = bar.segments.filter((s) => s.kind !== "free" && s.value > 0);
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono">
      {shown.map((seg) => (
        <li key={seg.key} className="flex items-center gap-1.5 min-w-0">
          <span className={cn("size-2 shrink-0 rounded-[2px]", segmentBg(seg))} aria-hidden />
          {seg.slug ? (
            <Link href={`/projects/${seg.slug}`} className="truncate hover:underline">
              {seg.label}
            </Link>
          ) : (
            <span className="truncate text-muted-foreground" title={seg.containers.join(", ") || undefined}>
              {seg.label}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground" title={segmentTitle(seg, fmtBytes)}>
            {fmtBytes(seg.value)}
            {seg.stats && seg.stats.peak > seg.value * 1.05 && (
              <span className="text-muted-foreground/60"> ↑{fmtBytes(seg.stats.peak)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HostCapacityCard({ host }: { host: HostCapacity }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">
          <Link href={`/servers/${host.hostId}`} className="hover:underline">
            {host.hostName}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {host.mem ? (
          <>
            <Bar bar={host.mem} format={fmtBytes} height="h-4" label="RAM" />
            <Legend bar={host.mem} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No memory figures from this host.</p>
        )}
        {host.cpu && <Bar bar={host.cpu} format={fmtCores} height="h-2" label="CPU" />}
        {host.disk && <DiskBar disk={host.disk} />}
      </CardContent>
    </Card>
  );
}

function intro(hosts: HostCapacity[]): string {
  const spans = hosts.map((h) => h.history?.spanHours ?? 0);
  const longest = Math.max(0, ...spans);
  if (hosts.some((h) => h.mem?.basis === "p95")) {
    return `Bars show each project's p95 (a typical busy moment) over the last ${fmtSpan(longest)}, so they add up to a little more than any single moment; hover for now and peak, ↑ marks a peak well above p95. The dashed line is the 80% comfort limit.`;
  }
  const soFar = longest > 0 ? ` (${fmtSpan(longest)} recorded so far)` : "";
  return `What's using each server right now. The dashed line is the 80% comfort limit. Switches to p95 and peak usage once ${MIN_HISTORY_HOURS} hours of history is recorded${soFar}.`;
}

export async function CapacityPanel() {
  const hosts = await getHostCapacities();
  if (hosts.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="capacity-heading">
      <div>
        <h2 id="capacity-heading" className="text-sm font-semibold">
          Capacity
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{intro(hosts)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {hosts.map((h) => (
          <HostCapacityCard key={h.hostId} host={h} />
        ))}
      </div>
    </section>
  );
}
