import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCapacityOverview, MIN_HISTORY_HOURS, type CapacityBar, type HostCapacity } from "@/lib/infra/capacity";
import { Bar, fmtBytes, fmtCores, fmtDisk, fmtSpan, segmentBg, segmentTitle } from "@/components/capacity-bar";
import { plainDiskBar } from "@/lib/infra/capacity-core";
import { MoveSimulator } from "@/components/move-simulator";
import { cn } from "@/lib/utils";

// BXD-61: "will it fit?" at a glance. One card per server host; each resource is a
// bar of the host's full capacity, split into the projects using it, then unregistered
// and shared containers, then whatever the host itself uses, then free space. RAM is
// the primary bar (it's the constraint that matters most here).

function DiskSection({ host }: { host: HostCapacity }) {
  if (host.diskBar) {
    const at = host.diskBar.measuredAt
      ? new Date(host.diskBar.measuredAt).toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : undefined;
    return (
      <>
        <Bar bar={host.diskBar} format={fmtDisk} height="h-2.5" label={`Disk${at ? ` · measured ${at}` : ""}`} />
        <Legend bar={host.diskBar} format={fmtDisk} limit={6} />
      </>
    );
  }
  if (!host.disk) return null;
  return <Bar bar={plainDiskBar(host.disk)} format={fmtDisk} height="h-2" label="Disk" />;
}

function Legend({ bar, format = fmtBytes, limit }: { bar: CapacityBar; format?: (v: number) => string; limit?: number }) {
  const all = bar.segments.filter((s) => s.kind !== "free" && s.value > 0);
  // With a limit, keep the biggest projects/buckets and fold the rest into one line.
  const ranked = limit ? [...all].sort((a, b) => b.value - a.value) : all;
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const rest = limit ? ranked.slice(limit) : [];
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
            <span className="truncate text-muted-foreground" title={seg.containers.join(", ") || seg.label}>
              {seg.label}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground" title={segmentTitle(seg, format)}>
            {format(seg.value)}
            {seg.stats && seg.stats.peak > seg.value * 1.05 && (
              <span className="text-muted-foreground/60"> ↑{format(seg.stats.peak)}</span>
            )}
          </span>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex items-center gap-1.5 min-w-0 text-muted-foreground" title={rest.map((r) => `${r.label}: ${format(r.value)}`).join("\n")}>
          <span className="size-2 shrink-0" aria-hidden />
          <span className="truncate">+ {rest.length} smaller</span>
          <span className="ml-auto shrink-0">{format(rest.reduce((n, r) => n + r.value, 0))}</span>
        </li>
      )}
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
        <DiskSection host={host} />
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
  const { hosts, projects } = await getCapacityOverview();
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
      <MoveSimulator hosts={hosts} projects={projects} />
    </section>
  );
}
