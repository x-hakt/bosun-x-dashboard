// IDEA-20: the session state machine, shared by the roster (lib/activity.ts) and the
// ship's log timeline (BXD-84), so the two can never disagree about a session. Pure: no
// fs, no React. Tested by scripts/test/activity-state.mjs and ship-log.test.mjs.

export type CrewState = "working" | "waiting_for_tool" | "needs_approval" | "ready_for_prompt" | "finished" | "stale" | "unknown";
export type Kind = "session_start" | "turn_start" | "tool_start" | "tool_end" | "approval_request" | "assignment" | "turn_stop" | "session_end" | "interrupt" | "subagent_start" | "subagent_stop" | "heartbeat";
export type ActivityEvent = { v: 1; id: string; provider: string; session: string; parent: string | null; turn: string | null; host: string | null; kind: Kind; project: string | null; task: string | null; at: string; received: string };

export const KNOWN_KINDS = new Set<Kind>(["session_start", "turn_start", "tool_start", "tool_end", "approval_request", "assignment", "turn_stop", "session_end", "interrupt", "subagent_start", "subagent_stop", "heartbeat"]);

// No event for STALE_MS: the signal is stale (shown asleep). None for LOST_MS: we no
// longer know anything, and the session drops off the deck.
export const STALE_MS = 5 * 60_000;
export const LOST_MS = 60 * 60_000;

export function nextState(kind: Kind, current: CrewState): CrewState {
  switch (kind) {
    case "session_start": case "turn_start": case "tool_end": case "subagent_start": return "working";
    case "tool_start": return "waiting_for_tool";
    case "approval_request": return "needs_approval";
    case "turn_stop": case "interrupt": return "ready_for_prompt";
    case "session_end": case "subagent_stop": return "finished";
    default: return current; // heartbeat, assignment: keep the state, refresh last seen
  }
}

// What a state last set at `lastSeen` means at `now`, once silence is taken into account.
export function observedState(state: CrewState, lastSeen: number, now: number): CrewState {
  if (state === "finished") return state;
  const age = now - lastSeen;
  return age > LOST_MS ? "unknown" : age > STALE_MS ? "stale" : state;
}

// Valid events, each id once, in time order.
export function orderEvents(events: ActivityEvent[]): ActivityEvent[] {
  const unique = new Map<string, ActivityEvent>();
  for (const event of events) if (event.v === 1 && KNOWN_KINDS.has(event.kind) && !unique.has(event.id)) unique.set(event.id, event);
  return [...unique.values()].sort((a, b) => a.at.localeCompare(b.at) || a.received.localeCompare(b.received) || a.id.localeCompare(b.id));
}

export const sessionKey = (event: Pick<ActivityEvent, "provider" | "session">) => `${event.provider}:${event.session}`;

// The roster: every session's current observed state, most recently seen first.
export type CrewMember = { key: string; provider: string; project: string | null; task: string | null; parent: string | null; host: string | null; state: CrewState; lastSeen: string; since: string; events: number };

export function projectActivity(events: ActivityEvent[], now = Date.now()): CrewMember[] {
  const sessions = new Map<string, CrewMember>();
  for (const event of orderEvents(events)) {
    const key = sessionKey(event);
    const member = sessions.get(key) ?? { key, provider: event.provider, project: null, task: null, parent: null, host: null, state: "unknown" as CrewState, lastSeen: event.at, since: event.at, events: 0 };
    if (event.project) member.project = event.project;
    if (event.task) member.task = event.task;
    if (event.parent) member.parent = event.parent;
    if (event.host) member.host = event.host;
    member.events++;
    member.lastSeen = event.at;
    const next = nextState(event.kind, member.state);
    if (next !== member.state) member.since = event.at;
    member.state = next;
    sessions.set(key, member);
  }
  return [...sessions.values()]
    .map((member) => ({ ...member, state: observedState(member.state, Date.parse(member.lastSeen), now) }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

// ---------------------------------------------------------------------------
// BXD-84: the ship's log. One lane per session over a bounded window, as state segments.
// Between two events a session holds the state the first one set, until the silence rules
// kick in: stale after STALE_MS, nothing drawn after LOST_MS (unknown), nothing after it
// finishes. The lane's final state is exactly what the roster shows at `end`.

export interface LogSegment {
  state: Exclude<CrewState, "finished" | "unknown">;
  from: number; // ms epoch, clipped to the window
  to: number;
}

export interface LogLane {
  key: string;
  provider: string;
  session: string;
  project: string | null;
  task: string | null;
  parent: string | null;
  firstSeen: number;
  lastSeen: number;
  state: CrewState; // at the window's end
  segments: LogSegment[];
}

export interface LogGroup {
  project: string | null; // null: unmapped sessions
  lanes: LogLane[];
}

export interface ShipLog {
  start: number;
  end: number;
  groups: LogGroup[];
}

function pushSegment(out: LogSegment[], state: CrewState, from: number, to: number, start: number, end: number) {
  if (state === "finished" || state === "unknown") return;
  const a = Math.max(from, start);
  const b = Math.min(to, end);
  if (b <= a) return;
  const last = out.at(-1);
  if (last && last.state === state && last.to >= a) last.to = Math.max(last.to, b);
  else out.push({ state, from: a, to: b });
}

// The span from one event to the next (or to `end`), split by the silence rules.
function holdState(out: LogSegment[], state: CrewState, since: number, until: number, start: number, end: number) {
  if (state === "finished" || state === "unknown") return;
  pushSegment(out, state, since, Math.min(until, since + STALE_MS), start, end);
  pushSegment(out, "stale", since + STALE_MS, Math.min(until, since + LOST_MS), start, end);
}

export function buildShipLog(events: ActivityEvent[], window: { start: number; end: number }): ShipLog {
  const { start, end } = window;
  const bySession = new Map<string, ActivityEvent[]>();
  for (const event of orderEvents(events)) {
    const t = Date.parse(event.at);
    if (t > end) continue;
    const key = sessionKey(event);
    bySession.set(key, [...(bySession.get(key) ?? []), event]);
  }

  const lanes: LogLane[] = [];
  for (const [key, list] of bySession) {
    const segments: LogSegment[] = [];
    let state: CrewState = "unknown";
    let project: string | null = null, task: string | null = null, parent: string | null = null;
    list.forEach((event, i) => {
      const t = Date.parse(event.at);
      if (event.project) project = event.project;
      if (event.task) task = event.task;
      if (event.parent) parent = event.parent;
      state = nextState(event.kind, state);
      const until = i + 1 < list.length ? Date.parse(list[i + 1].at) : end;
      holdState(segments, state, t, until, start, end);
    });
    const lastSeen = Date.parse(list.at(-1)!.at);
    if (segments.length === 0 && lastSeen < start) continue; // nothing in the window
    lanes.push({
      key,
      provider: list[0].provider,
      session: list[0].session,
      project,
      task,
      parent,
      firstSeen: Date.parse(list[0].at),
      lastSeen,
      state: observedState(state, lastSeen, end),
      segments,
    });
  }

  // Group by project, most recently active first; inside a group, sessions by first seen,
  // each subagent straight after its parent.
  const groups = new Map<string | null, LogLane[]>();
  for (const lane of lanes) groups.set(lane.project, [...(groups.get(lane.project) ?? []), lane]);
  return {
    start,
    end,
    groups: [...groups]
      .map(([project, list]) => {
        const byStart = [...list].sort((a, b) => a.firstSeen - b.firstSeen || a.key.localeCompare(b.key));
        const withChildren = (lane: LogLane, seen: Set<LogLane>): LogLane[] => {
          seen.add(lane);
          return [lane, ...byStart.filter((l) => !seen.has(l) && l.parent === lane.session).flatMap((l) => withChildren(l, seen))];
        };
        const seen = new Set<LogLane>();
        const roots = byStart.filter((l) => !l.parent || !byStart.some((p) => p.session === l.parent));
        // Anything left over (a parent cycle) still gets a row.
        const ordered = [...roots.flatMap((root) => withChildren(root, seen)), ...byStart.filter((l) => !seen.has(l))];
        return { project, lanes: ordered };
      })
      .sort((a, b) => Math.max(...b.lanes.map((l) => l.lastSeen)) - Math.max(...a.lanes.map((l) => l.lastSeen))),
  };
}
