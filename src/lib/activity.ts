import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/data/paths";
import { loadTasks } from "@/lib/data/tasks";

export type CrewState = "working" | "waiting_for_tool" | "needs_approval" | "ready_for_prompt" | "finished" | "stale" | "unknown";
type Kind = "session_start" | "turn_start" | "tool_start" | "tool_end" | "approval_request" | "assignment" | "turn_stop" | "session_end" | "interrupt" | "subagent_start" | "subagent_stop" | "heartbeat";
type Event = { v: 1; id: string; provider: string; session: string; parent: string | null; turn: string | null; host: string | null; kind: Kind; project: string | null; task: string | null; at: string; received: string };
export type CrewMember = { key: string; provider: string; project: string | null; task: string | null; parent: string | null; host: string | null; state: CrewState; lastSeen: string; since: string; events: number };

const directory = () => path.resolve(/* turbopackIgnore: true */ process.env.BOSUN_ACTIVITY_DIR || path.join(DATA_DIR, ".activity"));
const knownKinds = new Set<Kind>(["session_start", "turn_start", "tool_start", "tool_end", "approval_request", "assignment", "turn_stop", "session_end", "interrupt", "subagent_start", "subagent_stop", "heartbeat"]);

export function projectActivity(events: Event[], now = Date.now()): CrewMember[] {
  const unique = new Map<string, Event>();
  for (const event of events) if (event.v === 1 && knownKinds.has(event.kind) && !unique.has(event.id)) unique.set(event.id, event);
  const ordered = [...unique.values()].sort((a, b) => a.at.localeCompare(b.at) || a.received.localeCompare(b.received) || a.id.localeCompare(b.id));
  const sessions = new Map<string, CrewMember>();
  for (const event of ordered) {
    const key = `${event.provider}:${event.session}`;
    const member = sessions.get(key) ?? { key, provider: event.provider, project: null, task: null, parent: null, host: null, state: "unknown" as CrewState, lastSeen: event.at, since: event.at, events: 0 };
    if (event.project) member.project = event.project;
    if (event.task) member.task = event.task;
    if (event.parent) member.parent = event.parent;
    if (event.host) member.host = event.host;
    member.events++;
    member.lastSeen = event.at;
    let next: CrewState = member.state;
    switch (event.kind) {
      case "session_start": case "turn_start": case "tool_end": case "subagent_start": next = "working"; break;
      case "tool_start": next = "waiting_for_tool"; break;
      case "approval_request": next = "needs_approval"; break;
      case "turn_stop": case "interrupt": next = "ready_for_prompt"; break;
      case "session_end": case "subagent_stop": next = "finished"; break;
      case "heartbeat": break;
      case "assignment": break;
    }
    if (next !== member.state) member.since = event.at;
    member.state = next;
    sessions.set(key, member);
  }
  return [...sessions.values()].map((member) => {
    const age = now - Date.parse(member.lastSeen);
    if (member.state !== "finished" && age > 5 * 60_000) return { ...member, state: age > 60 * 60_000 ? "unknown" : "stale" as CrewState };
    return member;
  }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function readActivity(limit = 2000): Promise<{ crew: CrewMember[]; events: Event[] }> {
  const dir = directory();
  const names = (await fs.readdir(/* turbopackIgnore: true */ dir).catch(() => []))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort().slice(-3);
  const events: Event[] = [];
  for (const name of names) {
    const raw = await fs.readFile(path.join(dir, name), "utf8").catch(() => "");
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try { events.push(JSON.parse(line) as Event); } catch { /* one truncated line must not break the room */ }
    }
  }
  const recent = events.slice(-limit);
  return { crew: projectActivity(recent), events: recent.sort((a, b) => b.at.localeCompare(a.at)) };
}

type PublicConfig = { enabled?: boolean; projects?: { slug: string; alias: string }[] };
export type PublicCrew = { alias: string; project: string; state: CrewState; updated: string };
export type PublicFleet = { project: string; todo: number; inProgress: number };
async function approvedProjects(): Promise<{ slug: string; alias: string }[]> {
  let config: PublicConfig;
  try { config = JSON.parse(await fs.readFile(path.join(DATA_DIR, "activity-public.json"), "utf8")) as PublicConfig; }
  catch { return []; }
  if (!config.enabled || !Array.isArray(config.projects)) return [];
  return config.projects.filter((p) => p && typeof p.slug === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(p.slug)
    && typeof p.alias === "string" && /^[\w .-]{1,40}$/.test(p.alias));
}

export async function publicFleet(): Promise<PublicFleet[]> {
  const projects = await approvedProjects();
  return Promise.all(projects.map(async ({ slug, alias }) => {
    const tasks = await loadTasks(slug);
    return { project: alias, todo: tasks.filter((task) => task.status === "todo").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length };
  }));
}

export async function publicCrew(): Promise<PublicCrew[]> {
  const allowed = new Map((await approvedProjects()).map((p) => [p.slug, p.alias]));
  const { crew } = await readActivity();
  const counts = new Map<string, number>();
  return crew.filter((member) => member.project && allowed.has(member.project) && member.state !== "finished" && member.state !== "unknown").slice(0, 30).map((member) => {
    const group = member.provider === "codex" ? "Codex" : member.provider === "claude" ? "Claude" : "Crew";
    const count = (counts.get(group) ?? 0) + 1;
    counts.set(group, count);
    return { alias: `${group} ${count}`, project: allowed.get(member.project!)!, state: member.state, updated: member.lastSeen.slice(0, 16) + "Z" };
  });
}
