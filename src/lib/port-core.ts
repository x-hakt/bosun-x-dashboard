// IDEA-20 (BXD-85..93): the port feed. One shape rendered by both /activity and the public
// /crew/embed, built here from already-gathered sources (lib/port-feed.ts does the I/O).
// Pure apart from node:crypto, so the public projection's leak tests can run it directly
// (scripts/test/port-feed.test.mjs).
//
// Public mode is an explicit whitelist: every field of every object is written out below,
// nothing is spread from a source record. Approved projects appear under their alias; any
// other project becomes a numbered "private voyage" (state and timing only); ids are opaque
// HMACs; times are rounded to the minute. Sailor names are generated from a hash of the
// session key, so the same session has the same name on both pages and the name says
// nothing about the session.

import { createHash, createHmac } from "node:crypto";
import { buildShipLog, nextState, orderEvents, projectActivity, sessionKey, type ActivityEvent, type CrewState, type LogSegment } from "@/lib/activity-state";

export type ShipKind = "project" | "voyage" | "dinghy";
export type HappeningKind = "tide" | "cart" | "cargo" | "delivery" | "bell" | "arrival" | "departure";
export type EntryKind = "aboard" | "cabin" | "work" | "nod" | "captain" | "ashore" | "signoff" | "cargo" | "delivery" | "cart";

export interface PortShip {
  key: string;
  name: string;
  kind: ShipKind;
  active: boolean; // crew aboard or a sign of life in the last IN_PORT_MS: at the quay, sails set
  todo: number | null; // null: not shown (private voyages, the dinghy)
  inProgress: number | null;
  href?: string; // private only
}

export interface PortSailor {
  id: string;
  name: string; // "Salty Meg": generated, stable per session, the same on both pages
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
  who?: string; // the dockhand running the errand
  detail?: string; // private only
}

// One line of the rolling log: "<who> <action>", where {ship} in the action is the ship's name.
export interface LogEntry {
  id: string;
  at: string;
  kind: EntryKind;
  who: string;
  action: string;
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
  entries: LogEntry[];
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
export const IN_PORT_MS = 3 * 3_600_000; // a ship stays at the quay this long after its last sign of life
export const HAPPENING_WINDOW_MS = 60 * 60_000;
export const SHORT_SESSION_MS = 60_000; // finished sessions shorter than this stay off both logs
export const MAX_ENTRIES = 300;
export const DINGHY_KEY = "~dinghy";

const PROVIDER: Record<string, string> = { claude: "Claude", codex: "Codex" };
const providerName = (p: string) => PROVIDER[p] ?? "Crew";
const minute = (t: number) => new Date(Math.floor(t / 60_000) * 60_000).toISOString();
const onDeck = (s: CrewState) => s !== "finished" && s !== "unknown";

// ---- names (BXD-91)
const FIRST = ["Meg", "Bill", "Jack", "Anne", "Tom", "Nell", "Finn", "Rosa", "Kit", "Ned", "Moll", "Sam", "Bess", "Jonah", "Ivy", "Cal", "Wren", "Dot", "Hal", "Pip", "Mae", "Rory", "Gus", "Lou", "Tess", "Abe", "June", "Olly", "Kip", "Nan", "Bo", "Flo"];
const EPITHET = ["Salty", "Barnacle", "Stormy", "Lucky", "Quick", "Red", "Tidy", "Briny", "Squall", "Foggy", "Pickle", "Rusty", "Sunny", "Whistling", "Compass", "Lantern", "Gull", "Anchor", "Driftwood", "Kelp", "Starboard", "Port-side", "Bilge", "Sextant"];
const digest = (s: string) => createHash("sha256").update(s).digest();
export function sailorName(key: string): string {
  const d = digest(`sailor:${key}`);
  return `${EPITHET[d.readUInt16BE(0) % EPITHET.length]} ${FIRST[d.readUInt16BE(2) % FIRST.length]}`;
}
export function dockhandName(id: string): string {
  return `Dockhand ${FIRST[digest(`dock:${id}`).readUInt16BE(0) % FIRST.length]}`;
}

// Several crates, pennants or carts for one ship in the same minute read as one line.
const PLURAL: Partial<Record<EntryKind, (n: number) => string>> = {
  cargo: (n) => `loaded ${n} crates onto {ship}`,
  delivery: (n) => `{ship} ran up ${n} pennants: ${n} tasks are done`,
  cart: (n) => `carted ${n} loads of barrels from {ship} to the warehouse`,
};
function mergeRepeats(entries: LogEntry[]): LogEntry[] {
  // Grouped by (minute, kind, ship) whatever the order within the minute, so the private and
  // public feeds (ordered by different ids) merge the same way.
  const out: LogEntry[] = [];
  const groups = new Map<string, { entry: LogEntry; n: number }>();
  for (const e of entries) {
    const key = `${e.at.slice(0, 16)}|${e.kind}|${e.ship}`;
    const group = PLURAL[e.kind] ? groups.get(key) : undefined;
    if (group) {
      group.n += 1;
      group.entry.action = PLURAL[e.kind]!(group.n);
      if (group.entry.detail !== undefined && e.detail) group.entry.detail = `${group.entry.detail}, ${e.detail}`;
      continue;
    }
    const entry = { ...e };
    groups.set(key, { entry, n: 1 });
    out.push(entry);
  }
  return out;
}

export function buildPortFeed(src: PortSources, opts: PortOptions): PortFeed {
  const now = src.now;
  const pub = opts.publicView;
  const hmac = (value: string) => (pub ? createHmac("sha256", opts.secret).update(value).digest("hex").slice(0, 12) : value);
  const time = (iso: string) => (pub ? minute(Date.parse(iso)) : iso);
  const approved = new Map(pub ? opts.approved.map((a) => [a.slug, a.alias]) : []);
  const projectBySlug = new Map(src.projects.map((p) => [p.slug, p]));
  const inWindow = (iso: string, ms: number) => {
    const t = Date.parse(iso);
    return t >= now - ms && t <= now;
  };

  // ---- when each project last showed life
  const lastSeen = new Map<string, number>();
  const touch = (slug: string | null, iso: string) => {
    if (!slug) return;
    const t = Date.parse(iso);
    if (t <= now) lastSeen.set(slug, Math.max(lastSeen.get(slug) ?? t, t));
  };
  for (const e of src.events) touch(e.project, e.at);
  for (const list of [src.commits, src.deliveries, src.carts]) for (const h of list) touch(h.project, h.at);

  // ---- every project is a ship (BXD-90); private = slug, public = alias or numbered voyage.
  // Voyages are numbered in an order that reveals nothing (by keyed hash of the slug).
  const allSlugs = [...new Set([...src.projects.map((p) => p.slug), ...lastSeen.keys()])];
  const voyageNumber = new Map(allSlugs.filter((s) => !approved.has(s)).sort((a, b) => hmac(a).localeCompare(hmac(b))).map((s, i) => [s, i + 1]));
  const approvedIndex = new Map((pub ? opts.approved : []).map((a, i) => [a.slug, i + 1]));
  const shipKey = (slug: string | null): string => {
    if (!slug) return DINGHY_KEY;
    if (!pub) return slug;
    return approved.has(slug) ? `a${approvedIndex.get(slug)}` : `v${voyageNumber.get(slug) ?? 0}`;
  };
  const shipName = (slug: string | null): string => {
    if (!slug) return "Rowing boat";
    if (!pub) return projectBySlug.get(slug)?.name ?? slug;
    return approved.get(slug) ?? `Private voyage ${voyageNumber.get(slug) ?? 0}`;
  };

  // ---- sessions
  const roster = projectActivity(src.events, now);
  const sailors: PortSailor[] = roster.filter((m) => onDeck(m.state)).map((m) => {
    const base = { id: hmac(m.key), name: sailorName(m.key), provider: pub ? providerName(m.provider).toLowerCase() : m.provider, ship: shipKey(m.project), state: m.state, sub: Boolean(m.parent), since: time(m.since) };
    if (pub) return base;
    return {
      ...base,
      detail: `${m.key.split(":")[1].slice(0, 12)}${m.task ? ` · ${m.task}` : ""}`,
      href: m.project ? `/projects/${encodeURIComponent(m.project)}${m.task ? `#${encodeURIComponent(m.task)}` : ""}` : undefined,
    };
  });

  const active = new Set<string>();
  for (const s of roster) if (onDeck(s.state) && s.project) active.add(s.project);
  for (const [slug, t] of lastSeen) if (now - t < IN_PORT_MS) active.add(slug);
  const ships: PortShip[] = allSlugs.map((slug) => {
    const p = projectBySlug.get(slug);
    const kind: ShipKind = pub && !approved.has(slug) ? "voyage" : "project";
    const counts = kind === "voyage" ? { todo: null, inProgress: null } : { todo: p?.todo ?? 0, inProgress: p?.inProgress ?? 0 };
    const ship: PortShip = { key: shipKey(slug), name: shipName(slug), kind, active: active.has(slug), ...counts };
    if (!pub) ship.href = `/projects/${encodeURIComponent(slug)}`;
    return ship;
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key));
  if (sailors.some((s) => s.ship === DINGHY_KEY)) ships.push({ key: DINGHY_KEY, name: "Rowing boat", kind: "dinghy", active: true, todo: null, inProgress: null });

  // ---- happenings in the last hour, oldest first (the scene's errands)
  const raw: { id: string; kind: HappeningKind; at: string; project?: string | null; detail: string }[] = [];
  for (const t of new Set(src.tides)) if (inWindow(t, HAPPENING_WINDOW_MS)) raw.push({ id: `tide:${t}`, kind: "tide", at: t, detail: "capacity sample" });
  for (const c of src.carts) if (inWindow(c.at, HAPPENING_WINDOW_MS)) raw.push({ id: c.id, kind: "cart", at: c.at, project: c.project, detail: `backup ${c.id}` });
  for (const c of src.commits) if (inWindow(c.at, HAPPENING_WINDOW_MS)) raw.push({ id: c.id, kind: "cargo", at: c.at, project: c.project, detail: `commit ${c.id.slice(0, 7)}` });
  for (const d of src.deliveries) if (inWindow(d.at, HAPPENING_WINDOW_MS)) raw.push({ id: d.id, kind: "delivery", at: d.at, project: d.project, detail: `task ${d.id} done` });
  for (const e of src.events) {
    if (!inWindow(e.at, HAPPENING_WINDOW_MS)) continue;
    const kind: HappeningKind | null = e.kind === "approval_request" ? "bell"
      : e.kind === "session_start" || e.kind === "subagent_start" ? "arrival"
      : e.kind === "session_end" || e.kind === "subagent_stop" ? "departure" : null;
    if (kind) raw.push({ id: e.id, kind, at: e.at, project: e.project, detail: `${e.provider} ${e.kind.replaceAll("_", " ")}` });
  }
  const happenings: Happening[] = raw
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((h) => {
      const out: Happening = { id: hmac(h.id), kind: h.kind, at: time(h.at) };
      if (h.kind !== "tide") out.ship = shipKey(h.project ?? null);
      if (h.kind === "cargo" || h.kind === "cart" || h.kind === "delivery") out.who = dockhandName(h.id);
      if (!pub) out.detail = h.detail;
      return out;
    });

  // ---- sessions too short to matter (hook smoke tests, one-shot commands)
  const bySession = new Map<string, ActivityEvent[]>();
  for (const e of orderEvents(src.events)) bySession.set(sessionKey(e), [...(bySession.get(sessionKey(e)) ?? []), e]);
  const blip = new Set<string>();
  for (const [key, list] of bySession) {
    const end = list.at(-1)!;
    const done = end.kind === "session_end" || end.kind === "subagent_stop";
    if (done && Date.parse(end.at) - Date.parse(list[0].at) < SHORT_SESSION_MS) blip.add(key);
  }

  // ---- the rolling log (BXD-92): state changes, not every tool call
  const entries: LogEntry[] = [];
  const addEntry = (id: string, at: string, kind: EntryKind, who: string, action: string, slug: string | null | undefined, detail: string) => {
    if (!inWindow(at, LOG_WINDOW_MS)) return;
    const entry: LogEntry = { id: hmac(id), at: time(at), kind, who, action, ship: shipKey(slug ?? null) };
    if (!pub) entry.detail = detail;
    entries.push(entry);
  };
  for (const [key, list] of bySession) {
    if (blip.has(key)) continue;
    const who = sailorName(key);
    let state: CrewState = "unknown";
    let project: string | null = null;
    let task: string | null = null;
    for (const e of list) {
      if (e.project) project = e.project;
      if (e.task) task = e.task;
      const next = nextState(e.kind, state);
      const detail = `${e.session.slice(0, 12)}${task ? ` · ${task}` : ""}`;
      if (e.kind === "session_start") addEntry(e.id, e.at, "aboard", who, "went aboard {ship}", project, detail);
      else if (e.kind === "subagent_start") addEntry(e.id, e.at, "cabin", who, "ran aboard {ship} as a cabin hand", project, detail);
      else if (e.kind === "session_end") addEntry(e.id, e.at, "signoff", who, "signed off {ship}", project, detail);
      else if (e.kind === "subagent_stop") addEntry(e.id, e.at, "signoff", who, "finished up on {ship}", project, detail);
      else if (next === "needs_approval" && state !== "needs_approval") addEntry(e.id, e.at, "captain", who, "is waiting on the captain at {ship}", project, detail);
      else if (next === "ready_for_prompt" && state !== "ready_for_prompt") addEntry(e.id, e.at, "ashore", who, "stepped ashore from {ship}, ready for orders", project, detail);
      else if (next === "working" && state === "needs_approval") addEntry(e.id, e.at, "nod", who, "got the captain's nod on {ship}", project, detail);
      else if (next === "working" && (state === "ready_for_prompt" || state === "unknown")) addEntry(e.id, e.at, "work", who, "got to work on {ship}", project, detail);
      state = next;
    }
  }
  for (const c of src.commits) addEntry(c.id, c.at, "cargo", dockhandName(c.id), "loaded a crate onto {ship}", c.project, `commit ${c.id.slice(0, 7)}`);
  for (const d of src.deliveries) addEntry(d.id, d.at, "delivery", "", "{ship} ran up a pennant: a task is done", d.project, `task ${d.id}`);
  for (const c of src.carts) addEntry(c.id, c.at, "cart", dockhandName(c.id), "carted barrels from {ship} to the warehouse", c.project, `backup ${c.id}`);
  entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const recentEntries = mergeRepeats(entries).slice(-MAX_ENTRIES);

  // ---- the watch bill (per-session lanes)
  const log = buildShipLog(src.events, { start: now - LOG_WINDOW_MS, end: now });
  const round = (s: LogSegment): LogSegment => (pub ? { state: s.state, from: Date.parse(minute(s.from)), to: Date.parse(minute(s.to)) } : s);
  const drawn = (lane: (typeof log.groups)[number]["lanes"][number]) => lane.segments.reduce((sum, s) => sum + s.to - s.from, 0);
  const shown = log.groups
    .map((g) => ({ ...g, lanes: g.lanes.filter((lane) => onDeck(lane.state) || drawn(lane) >= SHORT_SESSION_MS) }))
    .filter((g) => g.lanes.length > 0);
  const groups: PortLogGroup[] = shown.map((g) => {
    const depth = new Map<string, number>();
    for (const lane of g.lanes) depth.set(lane.session, lane.parent && depth.has(lane.parent) ? Math.min(3, depth.get(lane.parent)! + 1) : 0);
    const kind: ShipKind = !g.project ? "dinghy" : pub && !approved.has(g.project) ? "voyage" : "project";
    const group: PortLogGroup = {
      key: shipKey(g.project),
      name: shipName(g.project),
      kind,
      lanes: g.lanes.map((lane) => {
        const out: PortLane = { id: hmac(lane.key), name: sailorName(lane.key), depth: depth.get(lane.session) ?? 0, state: lane.state, segments: lane.segments.map(round).filter((s) => s.to > s.from) };
        if (!pub) out.detail = `${providerName(lane.provider)} · ${lane.session.slice(0, 12)}${lane.task ? ` · ${lane.task}` : ""}`;
        return out;
      }),
    };
    if (!pub && g.project) group.href = `/projects/${encodeURIComponent(g.project)}`;
    return group;
  });
  const chores: PortChore[] = src.chores
    .filter((c) => inWindow(c.at, LOG_WINDOW_MS))
    .map((c) => ({ id: hmac(c.id), at: Date.parse(time(c.at)), outcome: c.outcome, label: pub ? "harbour chore" : c.label }));
  const oldest = src.events.reduce((m, e) => Math.min(m, Date.parse(e.at)), now);
  const truncatedSince = src.eventsTruncated && oldest > now - LOG_WINDOW_MS ? Date.parse(time(new Date(oldest).toISOString())) : undefined;

  const feed: PortFeed = { now, publicView: pub, ships, sailors, happenings, entries: recentEntries, log: { start: log.start, end: log.end, groups, chores } };
  if (truncatedSince !== undefined) feed.log.truncatedSince = truncatedSince;
  return feed;
}
