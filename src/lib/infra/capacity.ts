import { loadHosts } from "@/lib/data/hosts";
import { listProjects } from "@/lib/data/projects";
import { displayName } from "@/lib/data/project-display";
import { getLocalSnapshot } from "./local";
import { getRemoteSnapshot } from "./remote";
import { discoverGroups } from "./discovery";
import { buildHostCapacity, parseMemUsage, type HostCapacity } from "./capacity-core";

export type { HostCapacity, CapacitySegment, CapacityBar } from "./capacity-core";
export { COMFORT_RATIO } from "./capacity-core";

// BXD-61: capacity per live-monitored server host (workstations excluded: they're
// not placement targets). Everything here is already fetched and cached for the
// Servers page (snapshots: 15s local / 5min remote; discovery: 5min), so this adds
// no new SSH or Docker calls of its own. Values are a point-in-time snapshot until
// the BXD-62 sampler + BXD-63 p95 land.
export async function getHostCapacities(): Promise<HostCapacity[]> {
  const [hosts, groups, projects] = await Promise.all([
    loadHosts(),
    discoverGroups().catch(() => []),
    listProjects(),
  ]);
  const projectInfo = Object.fromEntries(
    projects.map((p) => [p.meta.slug, { name: displayName(p.meta), status: p.meta.status }]),
  );

  const targets = hosts.filter((h) => h.live_monitored && h.role !== "workstation");
  const results = await Promise.all(
    targets.map(async (host) => {
      const snapshot = host.ssh_alias ? await getRemoteSnapshot(host.ssh_alias) : await getLocalSnapshot();
      if (!snapshot.usage) return null;
      const running = new Set(snapshot.containers.filter((c) => c.state === "running").map((c) => c.name));
      return buildHostCapacity({
        hostId: host.id,
        hostName: host.name,
        cores: snapshot.specs?.cores ?? 0,
        memTotalBytes: snapshot.usage.memTotalBytes,
        memUsedBytes: snapshot.usage.memUsedBytes,
        diskSizeBytes: snapshot.usage.diskSizeBytes,
        diskUsedBytes: snapshot.usage.diskUsedBytes,
        loadAvg1: snapshot.usage.loadAvg1,
        stats: [...snapshot.stats.entries()]
          .filter(([name]) => running.has(name))
          .map(([name, s]) => ({ name, cpuPercent: s.cpuPercent, memBytes: parseMemUsage(s.memUsage) })),
        groups: groups
          .filter((g) => g.host === host.id && g.reachable)
          .map((g) => ({ folder: g.folder, slug: g.matchedSlug, containers: g.containers.map((c) => c.name) })),
        projects: projectInfo,
      });
    }),
  );
  return results.filter((r): r is HostCapacity => r !== null);
}
