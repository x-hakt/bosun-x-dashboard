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
export type HappeningKind = "tide" | "cart" | "cargo" | "delivery" | "bell" | "arrival" | "departure" | "errand" | "refit" | "leak" | "dive" | "press" | "newsboy";
export type EntryKind = "aboard" | "cabin" | "work" | "nod" | "captain" | "ashore" | "signoff" | "cargo" | "delivery" | "cart" | "errand" | "logbook" | "refit" | "leak" | "dive" | "hole" | "card" | "draft" | "article" | "posted" | "notice";

export interface PortShip {
  key: string;
  name: string;
  kind: ShipKind;
  active: boolean; // crew aboard or a sign of life in the last IN_PORT_MS: at the quay, sails set
  style: number; // 0-65535: picks the ship's colours and flag (BXD-97), the same on both pages
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
  family?: string; // errands (BXD-94): lamplighter, courier, warehouse, watchman, sweeper, clerk
  ok?: boolean; // errands: false when the job failed
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
  family?: string; // the watch bill groups chores by who runs them
}

export interface PortFeed {
  now: number;
  publicView: boolean;
  ships: PortShip[];
  sailors: PortSailor[];
  needsYou: number; // BXD-111: the town crier's count of open Needs-you alerts
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
  chores: { id: string; at: string; outcome: PortChore["outcome"]; label: string; job?: string; family?: string }[];
  // BXD-94: scheduled job runs (every crontab line), each a town errand.
  errands: { id: string; at: string; job: string; label: string; family?: string; ok: boolean }[];
  // BXD-104: handoff starts, checkpoints and finishes from each project's HANDOFF.yml trail.
  logbook: { project: string; at: string; id: string; kind: "start" | "checkpoint" | "finish"; agent: string; work: string }[];
  // BXD-105: container starts and crashes, already mapped to projects.
  refits: { project: string; at: string; id: string; action: "start" | "crash"; container: string }[];
  // BXD-96: backup restore drills (fleet-restore-test.sh), one per store tested.
  dives?: { project: string; at: string; id: string; store: string; ok: boolean }[];
  // BXD-96 the press: what the content planner made (cards, drafts, articles) and what went out
  // (social posts, site articles). Project may be null (a channel with no ship).
  press?: { project: string | null; at: string; id: string; kind: "card" | "draft" | "article" | "published" | "site"; provider: string | null }[];
  // BXD-111: how many Needs-you alerts are open (the Overview badge). A count only, on both pages.
  needsYou: number;
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
// Names are re-drawn every watch (4 hours) so the crew stays fresh; within a watch a
// session keeps one name on both pages and in the log.
export const NAME_WATCH_MS = 4 * 60 * 60_000;
export const nameWatch = (now: number) => Math.floor(now / NAME_WATCH_MS);
export function sailorName(key: string, watch = 0): string {
  const d = digest(watch ? `sailor:${key}:${watch}` : `sailor:${key}`);
  return `${EPITHET[d.readUInt16BE(0) % EPITHET.length]} ${FIRST[d.readUInt16BE(2) % FIRST.length]}`;
}
export function dockhandName(id: string): string {
  return `Dockhand ${FIRST[digest(`dock:${id}`).readUInt16BE(0) % FIRST.length]}`;
}

// ---- errands (BXD-94): who runs each family of scheduled job, and what the log says.
const TRADE: Record<string, { title: string; ok: string; failed: string }> = {
  lamplighter: { title: "the lamplighter", ok: "trimmed the harbour lamps", failed: "came back with the lamps still dark" },
  courier: { title: "the courier", ok: "ran the post between the offices", failed: "came back with the post undelivered" },
  warehouse: { title: "the warehouse hand", ok: "stacked the warehouse", failed: "found the warehouse door jammed" },
  watchman: { title: "the watchman", ok: "walked the watch round the harbour", failed: "raised a shout on the watch" },
  sweeper: { title: "the sweeper", ok: "swept the quay", failed: "left the quay half swept" },
  clerk: { title: "the clerk", ok: "wrote up the harbour books", failed: "blotted the harbour books" },
};
const ODD_JOBS = { title: "the odd-job hand", ok: "ran a harbour chore", failed: "botched a harbour chore" };
export const trade = (family?: string) => (family && TRADE[family]) || ODD_JOBS;
/** One worker per job per watch: "Rosa the lamplighter". */
export function errandName(job: string, family: string | undefined, watch = 0): string {
  return `${FIRST[digest(`errand:${job}:${watch}`).readUInt16BE(0) % FIRST.length]} ${trade(family).title}`;
}
export const CHORE_GAP_MS = 30 * 60_000; // watch bill: at most one ok mark per job per half hour
export const ERRAND_LOG_GAP_MS = 3 * 3_600_000; // rolling log: at most one ok line per job per 3 hours
export const ERRAND_WALK_GAP_MS = 20 * 60_000; // the scene: a 5-minute job sends someone out every 20 minutes
/** Frequent jobs would bury everything: keep every failure and start, and one ok run per job
 *  per fixed `gapMs` bucket of the clock, so the same runs survive every refresh. Input and
 *  output oldest first. */
export function thinRuns<T extends { at: string; job?: string; ok?: boolean; outcome?: string }>(runs: T[], gapMs: number): T[] {
  const taken = new Set<string>();
  return runs.filter((r) => {
    const job = r.job ?? "";
    if (r.ok === false || r.outcome === "failed" || r.outcome === "started") return true;
    const bucket = `${job}|${Math.floor(Date.parse(r.at) / gapMs)}`;
    const first = !taken.has(bucket);
    taken.add(bucket);
    return first;
  });
}

// Several crates, pennants or carts for one ship in the same minute read as one line.
const PLURAL: Partial<Record<EntryKind, (n: number) => string>> = {
  cargo: (n) => `loaded ${n} crates onto {ship}`,
  delivery: (n) => `{ship} ran up ${n} pennants: ${n} tasks are done`,
  cart: (n) => `carted ${n} loads of barrels from {ship} to the whorehouse`,
  refit: (n) => `{ship} took on fresh timber: ${n} services redeployed`,
  leak: (n) => `{ship} sprang ${n} leaks: services fell over and were restarted`,
  dive: (n) => `divers checked {ship}'s hull: ${n} backups restored clean`,
  hole: (n) => `divers found ${n} holes in {ship}'s hull: backups failed their restore test`,
  card: (n) => `the press set ${n} topic cards for {ship}`,
  draft: (n) => `the press ran off ${n} drafts for {ship}`,
  article: (n) => `the press set ${n} long reads for {ship}`,
  posted: (n) => `the newsboy cried ${n} new posts for {ship}`,
  notice: (n) => `${n} new articles went up on {ship}'s notice board`,
};
const LOGBOOK: Record<string, string> = { start: "opened {ship}'s log for a new watch", checkpoint: "signed {ship}'s log", finish: "closed {ship}'s log for the watch" };
const AGENT = (a: string) => (/^claude/i.test(a) ? "Claude" : /^codex/i.test(a) ? "Codex" : "The crew");
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
  const watch = nameWatch(now);
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
  const dives = src.dives ?? [];
  const press = src.press ?? [];
  for (const list of [src.commits, src.deliveries, src.carts, src.logbook, src.refits, dives]) for (const h of list) touch(h.project, h.at);
  for (const p of press) touch(p.project, p.at);

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
    const base = { id: hmac(m.key), name: sailorName(m.key, watch), provider: pub ? providerName(m.provider).toLowerCase() : m.provider, ship: shipKey(m.project), state: m.state, sub: Boolean(m.parent), since: time(m.since) };
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
    // Style seed: from the slug for named ships; an anonymous voyage's comes from its number,
    // so a flag can't be matched back to a private project.
    const style = digest(kind === "voyage" ? `voyage:${voyageNumber.get(slug)}` : `ship:${slug}`).readUInt16BE(0);
    const ship: PortShip = { key: shipKey(slug), name: shipName(slug), kind, active: active.has(slug), style, ...counts };
    if (!pub) ship.href = `/projects/${encodeURIComponent(slug)}`;
    return ship;
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key));
  if (sailors.some((s) => s.ship === DINGHY_KEY)) ships.push({ key: DINGHY_KEY, name: "Rowing boat", kind: "dinghy", active: true, style: 0, todo: null, inProgress: null });

  // ---- happenings in the last hour, oldest first (the scene's errands)
  const raw: { id: string; kind: HappeningKind; at: string; project?: string | null; detail: string; errand?: PortSources["errands"][number]; ok?: boolean }[] = [];
  for (const t of new Set(src.tides)) if (inWindow(t, HAPPENING_WINDOW_MS)) raw.push({ id: `tide:${t}`, kind: "tide", at: t, detail: "capacity sample" });
  for (const c of src.carts) if (inWindow(c.at, HAPPENING_WINDOW_MS)) raw.push({ id: c.id, kind: "cart", at: c.at, project: c.project, detail: `backup ${c.id}` });
  for (const c of src.commits) if (inWindow(c.at, HAPPENING_WINDOW_MS)) raw.push({ id: c.id, kind: "cargo", at: c.at, project: c.project, detail: `commit ${c.id.slice(0, 7)}` });
  for (const d of src.deliveries) if (inWindow(d.at, HAPPENING_WINDOW_MS)) raw.push({ id: d.id, kind: "delivery", at: d.at, project: d.project, detail: `task ${d.id} done` });
  // BXD-105: one walk per ship per minute however many of its containers came up together.
  const refitSeen = new Set<string>();
  for (const r of src.refits) {
    if (!inWindow(r.at, HAPPENING_WINDOW_MS)) continue;
    const key = `${r.project}|${r.action}|${minute(Date.parse(r.at))}`;
    if (refitSeen.has(key)) continue;
    refitSeen.add(key);
    raw.push({ id: r.id, kind: r.action === "crash" ? "leak" : "refit", at: r.at, project: r.project, detail: `${r.container} ${r.action === "crash" ? "crashed" : "started"}` });
  }
  // BXD-96: one diver per ship per minute for a restore drill; a failed restore also rings the bell.
  const diveSeen = new Set<string>();
  for (const d of dives) {
    if (!inWindow(d.at, HAPPENING_WINDOW_MS)) continue;
    const key = `${d.project}|${d.ok}|${minute(Date.parse(d.at))}`;
    if (diveSeen.has(key)) continue;
    diveSeen.add(key);
    raw.push({ id: d.id, kind: "dive", at: d.at, project: d.project, detail: `restore test ${d.store}${d.ok ? " passed" : " FAILED"}`, ok: d.ok });
  }
  // BXD-96 the press: the printer carries a sheet up for things made, the newsboy runs papers
  // for things that went out. One walk per ship, kind of walk and minute.
  const pressSeen = new Set<string>();
  for (const p of press) {
    if (!inWindow(p.at, HAPPENING_WINDOW_MS)) continue;
    const kind: HappeningKind = p.kind === "published" || p.kind === "site" ? "newsboy" : "press";
    const key = `${p.project}|${kind}|${minute(Date.parse(p.at))}`;
    if (pressSeen.has(key)) continue;
    pressSeen.add(key);
    raw.push({ id: p.id, kind, at: p.at, project: p.project, detail: `${p.kind}${p.provider ? ` on ${p.provider}` : ""}` });
  }
  const errandFor = new Map<string, PortSources["errands"][number]>();
  for (const e of thinRuns(src.errands.filter((x) => inWindow(x.at, HAPPENING_WINDOW_MS)), ERRAND_WALK_GAP_MS)) errandFor.set(e.job, e); // oldest first: the latest wins
  for (const e of errandFor.values()) raw.push({ id: e.id, kind: "errand", at: e.at, detail: `${e.label}${e.ok ? "" : " failed"}`, errand: e });
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
      if (h.kind !== "tide" && h.kind !== "errand") out.ship = shipKey(h.project ?? null);
      if (h.kind === "cargo" || h.kind === "cart" || h.kind === "delivery" || h.kind === "refit" || h.kind === "dive" || h.kind === "press" || h.kind === "newsboy") out.who = dockhandName(h.id);
      if (h.kind === "dive") out.ok = h.ok !== false;
      if (h.errand) {
        out.who = errandName(h.errand.job, h.errand.family, watch);
        if (h.errand.family && TRADE[h.errand.family]) out.family = h.errand.family;
        out.ok = h.errand.ok;
      }
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
    const who = sailorName(key, watch);
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
  for (const c of src.carts) addEntry(c.id, c.at, "cart", dockhandName(c.id), "carted barrels from {ship} to the whorehouse", c.project, `backup ${c.id}`);
  for (const l of src.logbook) addEntry(l.id, l.at, "logbook", AGENT(l.agent), LOGBOOK[l.kind] ?? LOGBOOK.checkpoint, l.project, l.work.slice(0, 140));
  for (const r of src.refits) {
    if (r.action === "crash") addEntry(r.id, r.at, "leak", "", "{ship} sprang a leak: a service fell over and was restarted", r.project, `${r.container} crashed`);
    else addEntry(r.id, r.at, "refit", "", "{ship} took on fresh timber: a service redeployed", r.project, `${r.container} started`);
  }
  for (const d of dives) {
    if (d.ok) addEntry(d.id, d.at, "dive", "", "divers checked {ship}'s hull: a backup restored clean", d.project, `restore test ${d.store} passed`);
    else addEntry(d.id, d.at, "hole", "", "divers found a hole in {ship}'s hull: a backup failed its restore test", d.project, `restore test ${d.store} FAILED`);
  }
  const PRESS_LINE: Record<string, [EntryKind, string]> = {
    card: ["card", "the press set a topic card for {ship}"],
    draft: ["draft", "the press ran off a draft for {ship}"],
    article: ["article", "the press set a long read for {ship}"],
    published: ["posted", "the newsboy cried a new post for {ship}"],
    site: ["notice", "a new article went up on {ship}'s notice board"],
  };
  for (const p of press) {
    const [kind, shipAction] = PRESS_LINE[p.kind] ?? PRESS_LINE.draft;
    // A channel with no ship (a personal account) is printed "in town".
    const action = p.project ? shipAction : shipAction.replace(" for {ship}", " in town").replace(" on {ship}'s notice board", " on the town notice board");
    addEntry(p.id, p.at, kind, "", action, p.project, `${p.kind}${p.provider ? ` on ${p.provider}` : ""}`);
  }
  for (const e of thinRuns(src.errands, ERRAND_LOG_GAP_MS)) {
    const t = trade(e.family);
    addEntry(e.id, e.at, "errand", errandName(e.job, e.family, watch), e.ok ? t.ok : t.failed, null, `${e.label}${e.ok ? "" : " failed"}`);
  }
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
        const out: PortLane = { id: hmac(lane.key), name: sailorName(lane.key, watch), depth: depth.get(lane.session) ?? 0, state: lane.state, segments: lane.segments.map(round).filter((s) => s.to > s.from) };
        if (!pub) out.detail = `${providerName(lane.provider)} · ${lane.session.slice(0, 12)}${lane.task ? ` · ${lane.task}` : ""}`;
        return out;
      }),
    };
    if (!pub && g.project) group.href = `/projects/${encodeURIComponent(g.project)}`;
    return group;
  });
  const chores: PortChore[] = thinRuns([...src.chores].sort((a, b) => a.at.localeCompare(b.at)), CHORE_GAP_MS)
    .filter((c) => inWindow(c.at, LOG_WINDOW_MS))
    .map((c) => {
      const out: PortChore = { id: hmac(c.id), at: Date.parse(time(c.at)), outcome: c.outcome, label: pub ? "harbour chore" : c.label };
      if (c.family && TRADE[c.family]) out.family = c.family;
      return out;
    });
  const oldest = src.events.reduce((m, e) => Math.min(m, Date.parse(e.at)), now);
  const truncatedSince = src.eventsTruncated && oldest > now - LOG_WINDOW_MS ? Date.parse(time(new Date(oldest).toISOString())) : undefined;

  const feed: PortFeed = { now, publicView: pub, ships, sailors, needsYou: Math.max(0, Math.floor(src.needsYou ?? 0)), happenings, entries: recentEntries, log: { start: log.start, end: log.end, groups, chores } };
  if (truncatedSince !== undefined) feed.log.truncatedSince = truncatedSince;
  return feed;
}
