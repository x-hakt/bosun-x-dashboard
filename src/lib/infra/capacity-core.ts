// BXD-61: the pure half of the capacity view: joins one host's snapshot (host totals +
// per-container stats) with discovery's container→project grouping into stacked
// segments that always sum to the host's capacity. No I/O; its only runtime import is
// the dependency-free snapshot-sections.mjs, so scripts/test/capacity.test.mjs can
// transpile it and run it next to a copy of that file.
import { parseMemUsage } from "./snapshot-sections.mjs";

export { parseMemUsage };

export type SegmentKind = "project" | "unregistered" | "infra" | "reclaimable" | "other" | "free";

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
  incoming?: boolean; // BXD-64: a project being simulated onto this host
}

export interface CapacityBar {
  total: number;
  used: number; // everything except "free"
  segments: CapacitySegment[];
  basis: "snapshot" | "p95";
  liveUsed?: number; // on a p95 bar: what the live snapshot showed as used
  measuredAt?: string; // on a disk bar (BXD-65): when the daily measurement ran
}

export interface HostCapacity {
  hostId: string;
  hostName: string;
  mem: CapacityBar | null;
  cpu: CapacityBar | null;
  disk: { total: number; used: number } | null;
  history?: { samples: number; spanHours: number };
  arch?: string; // e.g. x86_64, from `uname -m`
  diskBar?: CapacityBar; // BXD-65: per-project disk split, when a daily measurement exists
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
const ORDER: Record<SegmentKind, number> = { project: 0, unregistered: 1, infra: 2, reclaimable: 3, other: 4, free: 5 };

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

// ---------------------------------------------------------------------------
// BXD-71: per-project usage over time, for the sparklines on a server's page. Same
// container → project mapping as the bars. The window is cut into fixed buckets; a
// bucket with no sample at all (sampler down) is null, drawn as a gap, while a sample
// in which the project had nothing running is a real 0.

export interface UsageSeries {
  values: (number | null)[]; // per bucket: the highest sample in it, or null for no samples
  p95: number; // over the raw samples, not the buckets
  peak: number;
  peakIndex: number; // bucket holding the peak (-1 with no samples)
  last: number | null; // the newest sample's value
}

export interface ProjectUsage {
  slug: string;
  name: string;
  status?: string;
  mem: UsageSeries; // bytes
  cpu: UsageSeries; // cores
}

export interface UsageWindow {
  end: number; // ms epoch
  windowMs: number;
  buckets: number;
}

export const USAGE_WINDOWS = {
  "24h": { windowMs: 24 * 3_600_000, buckets: 96 }, // 15-minute buckets
  "14d": { windowMs: 14 * 86_400_000, buckets: 168 }, // 2-hour buckets
} as const;

function usageSeries(points: { bucket: number; value: number }[], buckets: number): UsageSeries {
  const values: (number | null)[] = new Array(buckets).fill(null);
  let peak = 0;
  let peakIndex = -1;
  for (const { bucket, value } of points) {
    values[bucket] = Math.max(values[bucket] ?? 0, value);
    if (peakIndex === -1 || value > peak) {
      peak = value;
      peakIndex = bucket;
    }
  }
  return {
    values,
    p95: percentile(points.map((p) => p.value), PERCENTILE),
    peak,
    peakIndex,
    last: points.at(-1)?.value ?? null,
  };
}

// Every project discovery matched on the host, busiest (RAM p95) first; empty when no
// sample falls in the window.
export function buildProjectUsage(
  input: Pick<CapacityInput, "groups" | "projects">,
  samples: HistorySample[],
  window: UsageWindow,
): ProjectUsage[] {
  const start = window.end - window.windowMs;
  const bucketMs = window.windowMs / window.buckets;
  const inWindow = samples
    .map((s) => ({ s, t: Date.parse(s.t) }))
    .filter(({ t }) => t >= start && t <= window.end)
    .sort((a, b) => a.t - b.t);
  if (inWindow.length === 0) return [];

  const owner = ownership(input);
  const slugs = [...new Set(input.groups.flatMap((g) => (g.slug ? [g.slug] : [])))];
  const mem = new Map(slugs.map((slug) => [slug, [] as { bucket: number; value: number }[]]));
  const cpu = new Map(slugs.map((slug) => [slug, [] as { bucket: number; value: number }[]]));

  for (const { s, t } of inWindow) {
    const bucket = Math.min(window.buckets - 1, Math.floor((t - start) / bucketMs));
    const memSum = new Map(slugs.map((slug) => [slug, 0]));
    const cpuSum = new Map(slugs.map((slug) => [slug, 0]));
    for (const [name, [memBytes, cpuPercent]] of Object.entries(s.c)) {
      const slug = owner.get(name)?.slug;
      if (!slug || !memSum.has(slug)) continue;
      memSum.set(slug, memSum.get(slug)! + Math.max(0, memBytes));
      cpuSum.set(slug, cpuSum.get(slug)! + Math.max(0, cpuPercent) / 100);
    }
    for (const slug of slugs) {
      mem.get(slug)!.push({ bucket, value: memSum.get(slug)! });
      cpu.get(slug)!.push({ bucket, value: cpuSum.get(slug)! });
    }
  }

  return slugs
    .map((slug) => ({
      slug,
      name: input.projects[slug]?.name ?? slug,
      status: input.projects[slug]?.status,
      mem: usageSeries(mem.get(slug)!, window.buckets),
      cpu: usageSeries(cpu.get(slug)!, window.buckets),
    }))
    .sort((a, b) => b.mem.p95 - a.mem.p95 || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// BXD-64: "would project X fit on host Y?" Moves the project's segment (its p95 on a
// history-based bar, else its live value) from the source host's bars to the
// target's, without rescaling, so an overflow shows as an overflow.

export type FitVerdict = "ok" | "tight" | "over";

export interface SimulatedBar {
  bar: CapacityBar; // the host after the move; may be over capacity (overBy > 0)
  moving: number; // how much of this resource the project brings or frees
  ratio: number; // used / total after the move
  overBy: number;
  verdict: FitVerdict;
}

export interface MoveSimulation {
  target: { mem: SimulatedBar | null; cpu: SimulatedBar | null; disk: SimulatedBar | null };
  source: { mem: SimulatedBar | null; cpu: SimulatedBar | null; disk: SimulatedBar | null };
  // RAM and (when the source's per-project disk is measured) disk decide; CPU is
  // advisory, being a load-average estimate.
  verdict: FitVerdict;
  archMismatch: boolean;
}

const WORST: FitVerdict[] = ["ok", "tight", "over"];
const worst = (...v: (FitVerdict | undefined)[]) =>
  WORST[Math.max(0, ...v.filter((x): x is FitVerdict => Boolean(x)).map((x) => WORST.indexOf(x)))];

// A host with only a total/used figure (no per-project split yet) as a plain bar.
export function plainDiskBar(disk: { total: number; used: number }): CapacityBar {
  return finish([], { key: "other", kind: "other", label: "Used", value: disk.used, containers: [] }, disk.total);
}

export function fitVerdict(ratio: number): FitVerdict {
  return ratio > 1 ? "over" : ratio > COMFORT_RATIO ? "tight" : "ok";
}

function projectValue(bar: CapacityBar, slug: string): number {
  return bar.segments.find((s) => s.key === `project:${slug}`)?.value ?? 0;
}

function withoutProject(bar: CapacityBar, slug: string): SimulatedBar {
  const moving = projectValue(bar, slug);
  const kept = bar.segments.filter((s) => s.kind !== "free" && s.key !== `project:${slug}`);
  const used = kept.reduce((sum, s) => sum + s.value, 0);
  const free = Math.max(0, bar.total - used);
  return {
    bar: { ...bar, used, segments: [...kept, { key: "free", kind: "free", label: "Free", value: free, containers: [] }] },
    moving,
    ratio: bar.total > 0 ? used / bar.total : 0,
    overBy: Math.max(0, used - bar.total),
    verdict: fitVerdict(bar.total > 0 ? used / bar.total : 0),
  };
}

function withProject(bar: CapacityBar, incoming: CapacitySegment): SimulatedBar {
  // If the project already has a segment here (also_on), it's replaced, not doubled.
  const kept = bar.segments.filter((s) => s.kind !== "free" && s.key !== incoming.key);
  const segs = [...kept, { ...incoming, incoming: true }];
  const used = segs.reduce((sum, s) => sum + s.value, 0);
  const free = Math.max(0, bar.total - used);
  const ratio = bar.total > 0 ? used / bar.total : 0;
  return {
    bar: { ...bar, used, segments: [...segs, { key: "free", kind: "free", label: "Free", value: free, containers: [] }] },
    moving: incoming.value,
    ratio,
    overBy: Math.max(0, used - bar.total),
    verdict: fitVerdict(ratio),
  };
}

export function simulateMove(from: HostCapacity, to: HostCapacity, slug: string): MoveSimulation {
  const one = (src: CapacityBar | null, dst: CapacityBar | null) => {
    if (!src || !dst) return { target: null, source: src ? withoutProject(src, slug) : null };
    const seg = src.segments.find((s) => s.key === `project:${slug}`);
    const incoming: CapacitySegment = seg
      ? { ...seg, containers: [...seg.containers] }
      : { key: `project:${slug}`, kind: "project", label: slug, slug, value: 0, containers: [] };
    return { target: withProject(dst, incoming), source: withoutProject(src, slug) };
  };
  const mem = one(from.mem, to.mem);
  const cpu = one(from.cpu, to.cpu);
  // Disk only when the source's footprint is known; the target just needs totals.
  const targetDisk = to.diskBar ?? (to.disk ? plainDiskBar(to.disk) : null);
  const disk = from.diskBar ? one(from.diskBar, targetDisk) : { target: null, source: null };
  return {
    target: { mem: mem.target, cpu: cpu.target, disk: disk.target },
    source: { mem: mem.source, cpu: cpu.source, disk: disk.source },
    verdict: worst(mem.target?.verdict ?? "ok", disk.target?.verdict),
    archMismatch: Boolean(from.arch && to.arch && from.arch !== to.arch),
  };
}

// ---------------------------------------------------------------------------
// BXD-65: per-project disk. From the daily measurement (LOCAL_DISK_SCRIPT, parsed by
// parseDiskSections): each project gets its images' unique layers (split evenly when
// several projects share an image), its containers' writable layers, its named volumes
// (split likewise) and the size of its writable bind-mount folders. Images and volumes
// no container uses are "reclaimable"; shared base layers, build cache, the OS and
// everything else is "other".

export interface DiskRecord {
  t?: string;
  diskSizeBytes: number;
  diskUsedBytes: number;
  images: { id: string; size: number; unique: number }[];
  containers: { name: string; imageId: string; writable: number; volumes: string[]; binds: string[] }[];
  volumes: { name: string; size: number }[];
  bindDu: Record<string, number>;
}

const isUnder = (p: string, ancestor: string) => p !== ancestor && p.startsWith(ancestor.endsWith("/") ? ancestor : `${ancestor}/`);

export function buildDiskBar(record: DiskRecord, input: Pick<CapacityInput, "groups" | "projects">): CapacityBar | null {
  if (record.diskSizeBytes <= 0) return null;
  const owner = ownership(input);
  const buckets = new Map<string, { owner: Owner; value: number; containers: Set<string> }>();
  const add = (o: Owner, value: number, container?: string) => {
    const b = buckets.get(o.key) ?? { owner: o, value: 0, containers: new Set<string>() };
    b.value += Math.max(0, value);
    if (container) b.containers.add(container);
    buckets.set(o.key, b);
  };
  const ownerOf = (name: string) => owner.get(name) ?? INFRA;

  // Who uses what: image id / volume name / bind path → distinct owners.
  const users = (pick: (c: DiskRecord["containers"][number]) => string[]) => {
    const map = new Map<string, Map<string, Owner>>();
    for (const c of record.containers) {
      for (const item of pick(c)) {
        const o = ownerOf(c.name);
        if (!map.has(item)) map.set(item, new Map());
        map.get(item)!.set(o.key, o);
      }
    }
    return map;
  };
  const imageUsers = users((c) => (c.imageId ? [c.imageId] : []));
  const volumeUsers = users((c) => c.volumes);
  // A bind folder nested inside another measured one is already counted there.
  const measured = Object.keys(record.bindDu);
  const bindUsers = users((c) => c.binds.filter((b) => b in record.bindDu && !measured.some((m) => isUnder(b, m))));

  const reclaimable: Owner = { key: "reclaimable", kind: "reclaimable", label: "Unused images & volumes" };
  for (const img of record.images) {
    const who = imageUsers.get(img.id);
    if (!who || who.size === 0) add(reclaimable, img.unique);
    else for (const o of who.values()) add(o, img.unique / who.size);
  }
  for (const vol of record.volumes) {
    const who = volumeUsers.get(vol.name);
    if (!who || who.size === 0) add(reclaimable, vol.size);
    else for (const o of who.values()) add(o, vol.size / who.size);
  }
  for (const [path, who] of bindUsers) for (const o of who.values()) add(o, record.bindDu[path] / who.size);
  for (const c of record.containers) add(ownerOf(c.name), c.writable, c.name);

  const segments = [...buckets.values()].map((b) => ({ ...b.owner, value: b.value, containers: [...b.containers] }));
  const total = record.diskSizeBytes;
  const accounted = segments.reduce((sum, seg) => sum + seg.value, 0);
  const other = Math.max(0, Math.min(total, record.diskUsedBytes) - accounted);
  return finish(
    segments,
    { key: "other", kind: "other", label: "Shared layers, build cache, OS & other files", value: other, containers: [] },
    total,
    { measuredAt: record.t },
  );
}
