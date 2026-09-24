// BXD-61: the pure half of the capacity view: joins one host's snapshot (host totals +
// per-container stats) with discovery's container→project grouping into stacked
// segments that always sum to the host's capacity. No I/O; its only runtime import is
// the dependency-free snapshot-sections.mjs, so scripts/test/capacity.test.mjs can
// transpile it and run it next to a copy of that file.
import { parseMemUsage } from "./snapshot-sections.mjs";

export { parseMemUsage };

export type SegmentKind = "project" | "unregistered" | "infra" | "other" | "free";

export interface CapacitySegment {
  key: string;
  kind: SegmentKind;
  label: string;
  value: number; // bytes for memory, cores for CPU
  slug?: string;
  status?: string;
  containers: string[];
}

export interface CapacityBar {
  total: number;
  used: number; // everything except "free"
  segments: CapacitySegment[];
}

export interface HostCapacity {
  hostId: string;
  hostName: string;
  mem: CapacityBar | null;
  cpu: CapacityBar | null;
  disk: { total: number; used: number } | null;
}

export interface CapacityInput {
  hostId: string;
  hostName: string;
  cores: number;
  memTotalBytes: number;
  memUsedBytes: number;
  diskSizeBytes: number;
  diskUsedBytes: number;
  loadAvg1: number;
  // Per running container: CPU% as docker reports it (100 = one core) and memory usage.
  stats: { name: string; cpuPercent: number; memBytes: number }[];
  // Discovery groups on this host. A matched group carries the project's slug.
  groups: { folder: string; slug?: string; containers: string[] }[];
  projects: Record<string, { name: string; status?: string }>;
}

// Comfort line agreed for BXD-55: 80% (of p95 once history exists, BXD-63).
export const COMFORT_RATIO = 0.8;

type Pick = (s: CapacityInput["stats"][number]) => number;

function buildBar(input: CapacityInput, total: number, hostUsed: number, pick: Pick, otherLabel: string): CapacityBar {
  const owner = new Map<string, { key: string; kind: SegmentKind; label: string; slug?: string; status?: string }>();
  for (const group of input.groups) {
    for (const name of group.containers) {
      if (owner.has(name)) continue; // first group wins, so a container is never counted twice
      if (group.slug) {
        const project = input.projects[group.slug];
        owner.set(name, { key: `project:${group.slug}`, kind: "project", label: project?.name ?? group.slug, slug: group.slug, status: project?.status });
      } else {
        owner.set(name, { key: "unregistered", kind: "unregistered", label: "Unregistered" });
      }
    }
  }

  const buckets = new Map<string, CapacitySegment>();
  for (const stat of input.stats) {
    const value = Math.max(0, pick(stat));
    const o = owner.get(stat.name) ?? { key: "infra", kind: "infra" as const, label: "Shared containers" };
    const seg = buckets.get(o.key) ?? { ...o, value: 0, containers: [] };
    seg.value += value;
    seg.containers.push(stat.name);
    buckets.set(o.key, seg);
  }

  const order: Record<SegmentKind, number> = { project: 0, unregistered: 1, infra: 2, other: 3, free: 4 };
  const segments = [...buckets.values()]
    .filter((s) => s.value > 0 || s.kind === "project")
    .sort((a, b) => order[a.kind] - order[b.kind] || b.value - a.value || a.label.localeCompare(b.label));

  const containerSum = segments.reduce((sum, s) => sum + s.value, 0);
  // Host usage can read lower than the containers' own sum (different accounting
  // for page cache), so "used" is never less than what the containers account for.
  const used = Math.min(total, Math.max(hostUsed, containerSum));
  const other = Math.max(0, used - containerSum);
  if (other > 0) segments.push({ key: "other", kind: "other", label: otherLabel, value: other, containers: [] });

  // If containers alone exceed the host total (bad sample), scale down to fit so the bar never overflows.
  const allocated = containerSum + other;
  if (allocated > total && allocated > 0) {
    const scale = total / allocated;
    for (const s of segments) s.value *= scale;
  }
  const free = Math.max(0, total - segments.reduce((sum, s) => sum + s.value, 0));
  segments.push({ key: "free", kind: "free", label: "Free", value: free, containers: [] });

  return { total, used: total - free, segments };
}

export function buildHostCapacity(input: CapacityInput): HostCapacity {
  const mem =
    input.memTotalBytes > 0
      ? buildBar(input, input.memTotalBytes, input.memUsedBytes, (s) => s.memBytes, "Host / non-Docker")
      : null;
  const cpu =
    input.cores > 0
      ? buildBar(input, input.cores, Math.min(input.cores, input.loadAvg1), (s) => s.cpuPercent / 100, "Host / other (load avg)")
      : null;
  const disk = input.diskSizeBytes > 0 ? { total: input.diskSizeBytes, used: input.diskUsedBytes } : null;
  return { hostId: input.hostId, hostName: input.hostName, mem, cpu, disk };
}
