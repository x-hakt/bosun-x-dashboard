import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/data/paths";
import { projectActivity, type ActivityEvent, type CrewMember, type CrewState } from "@/lib/activity-state";

export { projectActivity } from "@/lib/activity-state";
export type { CrewMember, CrewState } from "@/lib/activity-state";
type Event = ActivityEvent;

const directory = () => path.resolve(/* turbopackIgnore: true */ process.env.BOSUN_ACTIVITY_DIR || path.join(DATA_DIR, ".activity"));

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
// The public view's switch and allowlist. Disabled (or unreadable) means nothing is public.
export async function publicAllowlist(): Promise<{ enabled: boolean; projects: { slug: string; alias: string }[] }> {
  let config: PublicConfig;
  try { config = JSON.parse(await fs.readFile(path.join(DATA_DIR, "activity-public.json"), "utf8")) as PublicConfig; }
  catch { return { enabled: false, projects: [] }; }
  if (!config.enabled) return { enabled: false, projects: [] };
  const projects = (Array.isArray(config.projects) ? config.projects : []).filter((p) => p && typeof p.slug === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(p.slug)
    && typeof p.alias === "string" && /^[\w .-]{1,40}$/.test(p.alias));
  return { enabled: true, projects };
}

