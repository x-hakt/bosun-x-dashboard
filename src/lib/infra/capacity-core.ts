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
  // Present on history-based bars (BXD-63): the live value, p95 and peak over the window.
  stats?: { current: number; p95: number; peak: number };
}

export interface CapacityBar {
  total: number;
  used: number; // everything except "free"
  segments: CapacitySegment[];
  basis: "snapshot" | "p95";
  liveUsed?: number; // on a p95 bar: what the live snapshot showed as used
}

export interface HostCapacity {
  hostId: string;
  hostName: string;
  mem: CapacityBar | null;
  cpu: CapacityBar | null;
  disk: { total: number; used: number } | null;
  history?: { samples: number; spanHours: number };
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

type Owner = { key: string; kind: SegmentKind; label: string; slug?: string; status?: string };
const INFRA: Owner = { key: "infra", kind: "infra", label: "Shared containers" };
const ORDER: Record<SegmentKind, number> = { project: 0, unregistered: 1, infra: 2, other: 3, free: 4 };

// container name → the segment it belongs to. First group wins, so a container is
// never counted twice.
function ownership(input: Pick<CapacityInput, "groups" | "projects">): Map<string, Owner> {
  const owner = new Map<string, Owner>();
  for (const group of input.groups) {
    for (const name of group.containers) {
      if (owner.has(name)) continue;
      if (group.slug) {
        const project = input.projects[group.slug];
        owner.set(name, { key: `project:${group.slug}`, kind: "project", label: project?.name ?? group.slug, slug: group.slug, status: project?.status });
      } else {
        owner.set(name, { key: "unregistered", kind: "unregistered", label: "Unregistered" });
      }
    }
  }
  return owner;
}

// One moment's allocation: per-segment totals plus the host's own "other" usage.
// Host usage can read lower than the containers' own sum (different accounting for
// page cache), so "used" is never less than what the containers account for.
function allocate(owner: Map<string, Owner>, values: { name: string; value: number }[], total: number, hostUsed: number) {
  const buckets = new Map<string, { owner: Owner; value: number; containers: string[] }>();
  for (const { name, value } of values) {
    const o = owner.get(name) ?? INFRA;
    const b = buckets.get(o.key) ?? { owner: o, value: 0, containers: [] };
    b.value += Math.max(0, value);
    b.containers.push(name);
    buckets.set(o.key, b);
  }
  const containerSum = [...buckets.values()].reduce((sum, b) => sum + b.value, 0);
  const used = Math.min(total, Math.max(hostUsed, containerSum));
  return { buckets, other: Math.max(0, used - containerSum) };
}

// Sort, append "other", scale down if the parts exceed capacity (bad sample, or
// summed p95s), and close with "free" so the segments always sum to the total.
function finish(segments: CapacitySegment[], other: CapacitySegment | null, total: number, extra: Partial<CapacityBar> = {}): CapacityBar {
  const out = segments
    .filter((s) => s.value > 0 || s.kind === "project")
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.value - a.value || a.label.localeCompare(b.label));
  if (other && other.value > 0) out.push(other);
  const allocated = out.reduce((sum, s) => sum + s.value, 0);
  if (allocated > total && allocated > 0) {
    const scale = total / allocated;
    for (const s of out) s.value *= scale;
  }
  const free = Math.max(0, total - out.reduce((sum, s) => sum + s.value, 0));
  out.push({ key: "free", kind: "free", label: "Free", value: free, containers: [] });
  return { total, used: total - free, segments: out, basis: "snapshot", ...extra };
}

type Resource = "mem" | "cpu";
const OTHER_LABEL: Record<Resource, string> = { mem: "Host / non-Docker", cpu: "Host / other (load avg)" };

function buildBar(input: CapacityInput, resource: Resource): CapacityBar {
  const total = resource === "mem" ? input.memTotalBytes : input.cores;
  const hostUsed = resource === "mem" ? input.memUsedBytes : Math.min(input.cores, input.loadAvg1);
  const values = input.stats.map((s) => ({ name: s.name, value: resource === "mem" ? s.memBytes : s.cpuPercent / 100 }));
  const { buckets, other } = allocate(ownership(input), values, total, hostUsed);
  const segments = [...buckets.values()].map((b) => ({ ...b.owner, value: b.value, containers: b.containers }));
  return finish(segments, { key: "other", kind: "other", label: OTHER_LABEL[resource], value: other, containers: [] }, total);
}

export function buildHostCapacity(input: CapacityInput): HostCapacity {
  const mem = input.memTotalBytes > 0 ? buildBar(input, "mem") : null;
  const cpu = input.cores > 0 ? buildBar(input, "cpu") : null;
  const disk = input.diskSizeBytes > 0 ? { total: input.diskSizeBytes, used: input.diskUsedBytes } : null;
  return { hostId: input.hostId, hostName: input.hostName, mem, cpu, disk };
}

// ---------------------------------------------------------------------------
// BXD-63: history. The sampler (BXD-62) records host totals and per-container
// [memBytes, cpuPercent] every 5 minutes; containers are mapped to projects here,
// with today's discovery. Each sample is allocated exactly like the live snapshot,
// then every segment gets current / p95 / peak across the window.

export interface HistorySample {
  t: string; // ISO timestamp
  cores: number;
  memTotal: number;
  memUsed: number;
  load1: number;
  c: Record<string, [number, number]>;
}

// Bars switch from the live snapshot to p95 once history spans at least this long.
export const MIN_HISTORY_HOURS = 24;
export const PERCENTILE = 0.95;

// Nearest-rank percentile of an unsorted list (0 for an empty one).
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function historyBar(input: CapacityInput, live: CapacityBar, samples: HistorySample[], resource: Resource): CapacityBar {
  const owner = ownership(input);
  const series = new Map<string, number[]>();
  const meta = new Map<string, { owner: Owner; containers: Set<string> }>();
  const otherSeries: number[] = [];

  samples.forEach((sample, i) => {
    const total = resource === "mem" ? sample.memTotal : sample.cores;
    const hostUsed = resource === "mem" ? sample.memUsed : Math.min(sample.cores, sample.load1);
    const values = Object.entries(sample.c).map(([name, [mem, cpu]]) => ({ name, value: resource === "mem" ? mem : cpu / 100 }));
    const { buckets, other } = allocate(owner, values, total, hostUsed);
    for (const [key, b] of buckets) {
      if (!series.has(key)) {
        // A segment first seen part-way through the window was 0 before that.
        series.set(key, new Array(i).fill(0));
        meta.set(key, { owner: b.owner, containers: new Set() });
      }
      series.get(key)!.push(b.value);
      b.containers.forEach((c) => meta.get(key)!.containers.add(c));
    }
    for (const list of series.values()) if (list.length < i + 1) list.push(0); // absent this sample
    otherSeries.push(other);
  });

  const liveByKey = new Map(live.segments.map((s) => [s.key, s]));
  const segments: CapacitySegment[] = [...series].map(([key, list]) => {
    const m = meta.get(key)!;
    const current = liveByKey.get(key)?.value ?? 0;
    const p95 = percentile(list, PERCENTILE);
    return { ...m.owner, value: p95, containers: [...m.containers], stats: { current, p95, peak: Math.max(...list, current) } };
  });
  // Live-only segments (a project started since the last sample) still show.
  for (const s of live.segments) {
    if (s.kind === "free" || s.kind === "other" || series.has(s.key)) continue;
    segments.push({ ...s, stats: { current: s.value, p95: s.value, peak: s.value } });
  }
  const otherCurrent = liveByKey.get("other")?.value ?? 0;
  const otherP95 = percentile(otherSeries, PERCENTILE);
  const other: CapacitySegment = {
    key: "other",
    kind: "other",
    label: OTHER_LABEL[resource],
    value: otherP95,
    containers: [],
    stats: { current: otherCurrent, p95: otherP95, peak: Math.max(...otherSeries, otherCurrent) },
  };
  return finish(segments, other, live.total, { basis: "p95", liveUsed: live.used });
}

// Replace a live capacity's RAM/CPU bars with p95-based ones when the history is
// long enough; otherwise return it unchanged apart from the history window info.
export function applyHistory(input: CapacityInput, live: HostCapacity, samples: HistorySample[]): HostCapacity {
  const ordered = samples.filter((s) => s.memTotal > 0).sort((a, b) => a.t.localeCompare(b.t));
  if (ordered.length === 0) return live;
  const spanHours = (Date.parse(ordered.at(-1)!.t) - Date.parse(ordered[0].t)) / 3_600_000;
  const history = { samples: ordered.length, spanHours };
  if (spanHours < MIN_HISTORY_HOURS) return { ...live, history };
  return {
    ...live,
    history,
    mem: live.mem ? historyBar(input, live.mem, ordered, "mem") : null,
    cpu: live.cpu ? historyBar(input, live.cpu, ordered.filter((s) => s.cores > 0), "cpu") : null,
  };
}
