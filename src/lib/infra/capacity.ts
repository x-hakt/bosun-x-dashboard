import { loadHosts } from "@/lib/data/hosts";
import { listProjects } from "@/lib/data/projects";
import { displayName } from "@/lib/data/project-display";
import { getLocalSnapshot } from "./local";
import { getRemoteSnapshot } from "./remote";
import { discoverGroups } from "./discovery";
import { applyHistory, buildDiskBar, buildHostCapacity, parseMemUsage, type CapacityInput, type HostCapacity } from "./capacity-core";
import { getCapacityHistory, getLatestDisk } from "./capacity-history";

export type { HostCapacity, CapacitySegment, CapacityBar } from "./capacity-core";

// BXD-64: what the move simulator warns about, per project (across all its hosts).
export interface ProjectFacts {
  slug: string;
  name: string;
  hosts: string[];
  namedVolumes: number;
  bindMounts: number;
  databases: string[]; // container names whose image looks like a database
  traefik: boolean; // any container carries traefik.enable=true
}

const DATABASE_IMAGE = /(^|\/)(postgres|postgis|mysql|mariadb|mongo|redis|valkey|clickhouse|influxdb|timescale)/i;
export { COMFORT_RATIO, MIN_HISTORY_HOURS } from "./capacity-core";

// BXD-61: capacity per live-monitored server host (workstations excluded: they're
// not placement targets). Everything here is already fetched and cached for the
// Servers page (snapshots: 15s local / 5min remote; discovery: 5min), so this adds
// no new SSH or Docker calls of its own. With a day or more of sampler history
// (BXD-62) the RAM/CPU bars show p95 over the window instead (BXD-63).
export async function getCapacityOverview(): Promise<{ hosts: HostCapacity[]; projects: ProjectFacts[] }> {
  const [hosts, groups, projects, history, diskRecords] = await Promise.all([
    loadHosts(),
    discoverGroups().catch(() => []),
    listProjects(),
    getCapacityHistory().catch(() => new Map()),
    getLatestDisk().catch(() => new Map()),
  ]);
  const projectInfo = Object.fromEntries(
    projects.map((p) => [p.meta.slug, { name: displayName(p.meta), status: p.meta.status }]),
  );

  const targets = hosts.filter((h) => h.live_monitored && h.role !== "workstation");
  const facts = new Map<string, ProjectFacts>();
  const results = await Promise.all(
    targets.map(async (host) => {
      const snapshot = host.ssh_alias ? await getRemoteSnapshot(host.ssh_alias) : await getLocalSnapshot();
      if (!snapshot.usage) return null;
      const running = new Set(snapshot.containers.filter((c) => c.state === "running").map((c) => c.name));
      const byName = new Map(snapshot.containers.map((c) => [c.name, c]));
      for (const g of groups) {
        if (g.host !== host.id || !g.matchedSlug) continue;
        const f = facts.get(g.matchedSlug) ?? {
          slug: g.matchedSlug,
          name: projectInfo[g.matchedSlug]?.name ?? g.matchedSlug,
          hosts: [],
          namedVolumes: 0,
          bindMounts: 0,
          databases: [],
          traefik: false,
        };
        if (!f.hosts.includes(host.id)) f.hosts.push(host.id);
        for (const { name } of g.containers) {
          const c = byName.get(name);
          if (!c) continue;
          for (const m of c.mounts ?? []) {
            if (m.startsWith("/")) f.bindMounts++;
            else f.namedVolumes++;
          }
          if (DATABASE_IMAGE.test(c.image) && !f.databases.includes(c.name)) f.databases.push(c.name);
          if (c.traefik) f.traefik = true;
        }
        facts.set(g.matchedSlug, f);
      }
      const input: CapacityInput = {
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
      };
      const capacity = applyHistory(input, buildHostCapacity(input), history.get(host.id) ?? []);
      const diskRecord = diskRecords.get(host.id);
      const result: HostCapacity = {
        ...capacity,
        arch: snapshot.specs?.kernel.split(/\s+/).at(-1),
        diskBar: diskRecord ? buildDiskBar(diskRecord, input) ?? undefined : undefined,
      };
      return result;
    }),
  );
  return {
    hosts: results.filter((r): r is HostCapacity => r !== null),
    projects: [...facts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
