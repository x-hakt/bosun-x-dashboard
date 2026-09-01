import Link from "next/link";
import type { Host } from "@/lib/types";
import { STATUS_DOT_CLASS } from "@/lib/status-colors";

// A compact status strip, not a spatial diagram — addresses, roles and live stats are
// on the host cards below. If one host has role "lighthouse" it's shown as a hub the
// others connect through; otherwise every host is just listed. Host-nodes read green
// (live-monitored), workstations grey (reachable, nothing to monitor).
function shortName(host: Host): string {
  return host.name.replace(/\s*\(.*\)\s*$/, "");
}

// host-nodes before workstations; original hosts.yml order within each group.
function orderSpokes(hosts: Host[]): Host[] {
  const rank = (h: Host) => (h.role === "workstation" ? 1 : 0);
  return hosts
    .filter((h) => h.role !== "lighthouse")
    .map((h, i) => ({ h, i }))
    .sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i)
    .map(({ h }) => h);
}

export function TopologyStrip({ hosts }: { hosts: Host[] }) {
  const lighthouse = hosts.find((h) => h.role === "lighthouse");
  const spokes = orderSpokes(hosts);

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-mono">
      {lighthouse && (
        <>
          <NodeChip
            host={lighthouse}
            label="lighthouse"
            accent
            title={`${shortName(lighthouse)} — relay + discovery; every node connects through here`}
          />
          <span className="mx-1 h-px w-5 bg-border" aria-hidden />
        </>
      )}
      {spokes.map((h) => (
        <NodeChip key={h.id} host={h} label={h.id} />
      ))}
    </div>
  );
}

function NodeChip({ host, label, accent, title }: { host: Host; label: string; accent?: boolean; title?: string }) {
  const dot = accent ? "bg-sky-400" : host.live_monitored ? STATUS_DOT_CLASS.up : STATUS_DOT_CLASS.unknown;
  return (
    <Link
      href={`/servers/${host.id}`}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </Link>
  );
}
