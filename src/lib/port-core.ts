// IDEA-20 (BXD-85..87): the port feed. One shape rendered by both /activity and the public
// /crew/embed, built here from already-gathered sources (lib/port-feed.ts does the I/O).
// Pure apart from node:crypto, so the public projection's leak tests can run it directly
// (scripts/test/port-feed.test.mjs).
//
// Public mode is an explicit whitelist: every field of every object is written out below,
// nothing is spread from a source record. Approved projects appear under their alias; any
// other project becomes a numbered "private voyage" (state and timing only); sessions get
// provider aliases and opaque HMAC ids; times are rounded to the minute.

import { createHmac } from "node:crypto";
import { buildShipLog, projectActivity, type ActivityEvent, type CrewState, type LogSegment } from "@/lib/activity-state";

export type ShipKind = "project" | "voyage" | "dinghy";
export type HappeningKind = "tide" | "cart" | "cargo" | "delivery" | "bell" | "arrival" | "departure";

export interface PortShip {
  key: string;
  name: string;
  kind: ShipKind;
  todo: number | null; // null: not shown (private voyages, the dinghy)
  inProgress: number | null;
  href?: string; // private only
}

export interface PortSailor {
  id: string;
  name: string; // "Claude 3": stable for the day, the same on both pages
  provider: string;
  ship: string; // a PortShip key
  state: CrewState;
  sub: boolean;
  since: string; // when the current state began
  detail?: string; // private only: session id and task
  href?: string; // private only
}

export interface Happening {
  id: string;
  kind: HappeningKind;
  at: string;
  ship?: string;
  detail?: string; // private only
}

export interface PortLane {
  id: string;
  name: string;
  depth: number; // 0, or 1+ for subagents under their parent
  state: CrewState;
  segments: LogSegment[];
  detail?: string; // private only
}

export interface PortLogGroup {
  key: string;
  name: string;
  kind: ShipKind;
  href?: string; // private only
  lanes: PortLane[];
}

export interface PortChore {
  id: string;
  at: number;
  outcome: "started" | "finished" | "failed";
  label: string; // private: the job's name; public: "harbour chore"
}

export interface PortFeed {
  now: number;
  publicView: boolean;
  ships: PortShip[];
  sailors: PortSailor[];
  happenings: Happening[];
  log: { start: number; end: number; groups: PortLogGroup[]; chores: PortChore[]; truncatedSince?: number };
}

export interface PortSources {
  now: number;
  events: ActivityEvent[];
  eventsTruncated: boolean;
  projects: { slug: string; name: string; todo: number; inProgress: number }[];
  commits: { project: string; at: string; id: string }[];
  deliveries: { project: string; at: string; id: string }[]; // tasks moved to done
  carts: { project: string; at: string; id: string }[]; // backup runs finished
  tides: string[]; // capacity sampler runs
  chores: { id: string; at: string; outcome: PortChore["outcome"]; label: string }[];
}

export type PortOptions = { publicView: false } | { publicView: true; approved: { slug: string; alias: string }[]; secret: string };

export const LOG_WINDOW_MS = 24 * 3_600_000;
export const IN_PORT_MS = 3 * 3_600_000; // a project stays moored this long after its last sign of life
export const HAPPENING_WINDOW_MS = 60 * 60_000;
const DINGHY = "~dinghy";

const PROVIDER: Record<string, string> = { claude: "Claude", codex: "Codex" };
const providerName = (p: string) => PROVIDER[p] ?? "Crew";
const minute = (t: number) => new Date(Math.floor(t / 60_000) * 60_000).toISOString();
const onDeck = (s: CrewState) => s !== "finished" && s !== "unknown";

export function buildPortFeed(src: PortSources, opts: PortOptions): PortFeed {
  const now = src.now;
  const pub = opts.publicView;
  const hmac = (value: string) => (pub ? createHmac("sha256", opts.secret).update(value).digest("hex").slice(0, 12) : value);
  const time = (iso: string) => (pub ? minute(Date.parse(iso)) : iso);
  const approved = new Map(pub ? opts.approved.map((a) => [a.slug, a.alias]) : []);
  const projectBySlug = new Map(src.projects.map((p) => [p.slug, p]));

  // ---- when each project last showed life, and first did today (voyage numbering)
  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const touch = (slug: string | null, iso: string) => {
    if (!slug) return;
    const t = Date.parse(iso);
    if (t > now) return;
    firstSeen.set(slug, Math.min(firstSeen.get(slug) ?? t, t));
    lastSeen.set(slug, Math.max(lastSeen.get(slug) ?? t, t));
  };
  for (const e of src.events) touch(e.project, e.at);
  for (const list of [src.commits, src.deliveries, src.carts]) for (const h of list) touch(h.project, h.at);

  // ---- ship identity: private = slug; public = approved alias, else a numbered voyage
  const voyageNumber = new Map(
    [...firstSeen.entries()].filter(([slug]) => !approved.has(slug)).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([slug], i) => [slug, i + 1]),
  );
  const approvedIndex = new Map((pub ? opts.approved : []).map((a, i) => [a.slug, i + 1]));
  const shipKey = (slug: string | null): string => {
    if (!slug) return DINGHY;
    if (!pub) return slug;
    return approved.has(slug) ? `a${approvedIndex.get(slug)}` : `v${voyageNumber.get(slug) ?? 0}`;
  };
  const shipOf = (slug: string | null): PortShip => {
    if (!slug) return { key: DINGHY, name: "Rowing boat", kind: "dinghy", todo: null, inProgress: null };
    const p = projectBySlug.get(slug);
    if (!pub) return { key: slug, name: p?.name ?? slug, kind: "project", todo: p?.todo ?? null, inProgress: p?.inProgress ?? null, href: `/projects/${encodeURIComponent(slug)}` };
    if (approved.has(slug)) return { key: shipKey(slug), name: approved.get(slug)!, kind: "project", todo: p?.todo ?? 0, inProgress: p?.inProgress ?? 0 };
    return { key: shipKey(slug), name: `Private voyage ${voyageNumber.get(slug) ?? 0}`, kind: "voyage", todo: null, inProgress: null };
  };

  // ---- sessions: roster state, names numbered per provider by first appearance
  const roster = projectActivity(src.events, now);
  const firstEvent = new Map<string, number>();
  for (const e of src.events) {
    const key = `${e.provider}:${e.session}`;
    firstEvent.set(key, Math.min(firstEvent.get(key) ?? Infinity, Date.parse(e.at)));
  }
  const nameOf = new Map<string, string>();
  const perProvider = new Map<string, number>();
  for (const key of [...firstEvent.keys()].sort((a, b) => firstEvent.get(a)! - firstEvent.get(b)! || a.localeCompare(b))) {
    const provider = key.slice(0, key.indexOf(":"));
    const n = (perProvider.get(provider) ?? 0) + 1;
    perProvider.set(provider, n);
    nameOf.set(key, `${providerName(provider)} ${n}`);
  }

  const sailors: PortSailor[] = roster.filter((m) => onDeck(m.state)).map((m) => {
    const base = { id: hmac(m.key), name: nameOf.get(m.key) ?? providerName(m.provider), provider: pub ? providerName(m.provider).toLowerCase() : m.provider, ship: shipKey(m.project), state: m.state, sub: Boolean(m.parent), since: time(m.since) };
    if (pub) return base;
    return {
      ...base,
      detail: `${m.key.split(":")[1].slice(0, 12)}${m.task ? ` · ${m.task}` : ""}`,
      href: m.project ? `/projects/${encodeURIComponent(m.project)}${m.task ? `#${encodeURIComponent(m.task)}` : ""}` : undefined,
    };
  });

  // ---- ships in port: crew aboard, or any sign of life in the last IN_PORT_MS
  const inPort = new Set<string>();
  for (const s of roster) if (onDeck(s.state) && s.project) inPort.add(s.project);
  for (const [slug, t] of lastSeen) if (now - t < IN_PORT_MS) inPort.add(slug);
  const ships = [...inPort].sort((a, b) => (lastSeen.get(b) ?? 0) - (lastSeen.get(a) ?? 0) || a.localeCompare(b)).map(shipOf);
  if (sailors.some((s) => s.ship === DINGHY)) ships.push(shipOf(null));

  // ---- happenings in the last hour, oldest first
  const since = now - HAPPENING_WINDOW_MS;
  const within = (iso: string) => {
    const t = Date.parse(iso);
    return t >= since && t <= now;
  };
  const raw: { id: string; kind: HappeningKind; at: string; project?: string | null; detail: string }[] = [];
  for (const t of new Set(src.tides)) if (within(t)) raw.push({ id: `tide:${t}`, kind: "tide", at: t, detail: "capacity sample" });
  for (const c of src.carts) if (within(c.at)) raw.push({ id: c.id, kind: "cart", at: c.at, project: c.project, detail: `backup ${c.id}` });
  for (const c of src.commits) if (within(c.at)) raw.push({ id: c.id, kind: "cargo", at: c.at, project: c.project, detail: `commit ${c.id.slice(0, 7)}` });
  for (const d of src.deliveries) if (within(d.at)) raw.push({ id: d.id, kind: "delivery", at: d.at, project: d.project, detail: `task ${d.id} done` });
  for (const e of src.events) {
    if (!within(e.at)) continue;
    const kind: HappeningKind | null = e.kind === "approval_request" ? "bell"
      : e.kind === "session_start" || e.kind === "subagent_start" ? "arrival"
      : e.kind === "session_end" || e.kind === "subagent_stop" ? "departure" : null;
    if (kind) raw.push({ id: e.id, kind, at: e.at, project: e.project, detail: `${e.provider} ${e.kind.replaceAll("_", " ")}` });
  }
  const happenings: Happening[] = raw
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((h) => {
      const ship = h.kind === "tide" ? undefined : shipKey(h.project ?? null);
      const out: Happening = { id: hmac(h.id), kind: h.kind, at: time(h.at) };
      if (ship) out.ship = ship;
      if (!pub) out.detail = h.detail;
      return out;
    });

  // ---- the ship's log
  const log = buildShipLog(src.events, { start: now - LOG_WINDOW_MS, end: now });
  const round = (s: LogSegment): LogSegment => (pub ? { state: s.state, from: Date.parse(minute(s.from)), to: Date.parse(minute(s.to)) } : s);
  const groups: PortLogGroup[] = log.groups.map((g) => {
    const ship = shipOf(g.project);
    const depth = new Map<string, number>();
    for (const lane of g.lanes) depth.set(lane.session, lane.parent && depth.has(lane.parent) ? Math.min(3, depth.get(lane.parent)! + 1) : 0);
    const group: PortLogGroup = {
      key: ship.key,
      name: ship.name,
      kind: ship.kind,
      lanes: g.lanes.map((lane) => {
        const out: PortLane = { id: hmac(lane.key), name: nameOf.get(lane.key) ?? providerName(lane.provider), depth: depth.get(lane.session) ?? 0, state: lane.state, segments: lane.segments.map(round).filter((s) => s.to > s.from) };
        if (!pub) out.detail = `${lane.session.slice(0, 12)}${lane.task ? ` · ${lane.task}` : ""}`;
        return out;
      }),
    };
    if (!pub && ship.href) group.href = ship.href;
    return group;
  });
  const chores: PortChore[] = src.chores
    .filter((c) => Date.parse(c.at) >= now - LOG_WINDOW_MS && Date.parse(c.at) <= now)
    .map((c) => ({ id: hmac(c.id), at: Date.parse(time(c.at)), outcome: c.outcome, label: pub ? "harbour chore" : c.label }));
  const oldest = src.events.reduce((m, e) => Math.min(m, Date.parse(e.at)), now);
  const truncatedSince = src.eventsTruncated && oldest > now - LOG_WINDOW_MS ? Date.parse(time(new Date(oldest).toISOString())) : undefined;

  const feed: PortFeed = { now, publicView: pub, ships: ships.map((s) => (pub ? { key: s.key, name: s.name, kind: s.kind, todo: s.todo, inProgress: s.inProgress } : s)), sailors, happenings, log: { start: log.start, end: log.end, groups, chores } };
  if (truncatedSince !== undefined) feed.log.truncatedSince = truncatedSince;
  return feed;
}
