// IDEA-20 (BXD-81): where each crew member stands on the ship, and in what pose.
// Pure layout, no React, so it can be unit-tested (scripts/test/crew-scene.test.mjs).
// Coordinates are in the ship SVG's viewBox (1000 × 440); a slot is where the
// character's feet go.

export type SceneState =
  | "working" | "waiting_for_tool" | "needs_approval" | "ready_for_prompt" | "finished" | "stale" | "unknown";

export type Station = "rigging" | "cannons" | "cabin" | "bow" | "berth";
export type Pose = "haul" | "fire" | "call" | "rest" | "sleep" | "climb" | "walk" | "doze" | "drink";

export interface SceneMember {
  id: string;
  state: SceneState;
  sub?: boolean; // a subagent: drawn smaller, as a cabin boy
}

export interface Placed {
  id: string;
  station: Station;
  pose: Pose;
  x: number;
  y: number;
  scale: number;
  tier: number; // nameplate row: 0 just above the head, 1 a row higher, so close neighbours don't overlap
}

export interface Overflow {
  station: Station;
  x: number;
  y: number;
  count: number;
}

// The state → station rule. Only observed states get a place on deck: a finished or
// unknown session is not shown (the roster below the ship still lists it).
export function stationFor(state: SceneState): Station | null {
  switch (state) {
    case "working": return "rigging";          // hauling lines at the mast
    case "waiting_for_tool": return "cannons"; // a tool is running: fuse lit, waiting
    case "needs_approval": return "cabin";     // at the captain's door: the operator is needed
    case "ready_for_prompt": return "bow";     // turn done, waiting for orders
    case "stale": return "berth";              // no signal for 5+ minutes: asleep
    default: return null;
  }
}

// Feet positions per station, in fill order. The quarterdeck (cabin) and forecastle (bow)
// are raised, hence their smaller y.
export const SLOTS: Record<Station, { x: number; y: number; pose?: Pose }[]> = {
  cabin: [{ x: 204, y: 268 }, { x: 244, y: 268 }, { x: 168, y: 268 }],
  rigging: [
    { x: 470, y: 300 }, { x: 532, y: 300 }, { x: 501, y: 222, pose: "climb" },
    { x: 438, y: 300 }, { x: 564, y: 300 },
  ],
  cannons: [{ x: 350, y: 300 }, { x: 640, y: 300 }, { x: 395, y: 300 }, { x: 685, y: 300 }],
  bow: [{ x: 790, y: 280 }, { x: 830, y: 280 }, { x: 752, y: 280 }, { x: 868, y: 280 }],
  berth: [{ x: 300, y: 300 }, { x: 724, y: 300 }, { x: 596, y: 300 }],
};

const POSE: Record<Station, Pose> = { rigging: "haul", cannons: "fire", cabin: "call", bow: "rest", berth: "sleep" };

// BXD-82: the pose a state gets anywhere a sailor is drawn off the main deck (the harbour).
export function poseFor(state: SceneState): Pose | null {
  const station = stationFor(state);
  return station ? POSE[station] : null;
}

// Place every member at its station's next free slot. When a station is full, the rest
// collapse into a "+n" marker over its last slot, so the deck never becomes a pile.
export function layoutCrew(members: SceneMember[]): { placed: Placed[]; overflow: Overflow[] } {
  const used = new Map<Station, number>();
  const extra = new Map<Station, number>();
  const placed: Placed[] = [];
  for (const m of members) {
    const station = stationFor(m.state);
    if (!station) continue;
    const slots = SLOTS[station];
    const n = used.get(station) ?? 0;
    if (n >= slots.length) {
      extra.set(station, (extra.get(station) ?? 0) + 1);
      continue;
    }
    used.set(station, n + 1);
    const slot = slots[n];
    placed.push({
      id: m.id,
      station,
      pose: slot.pose ?? POSE[station],
      x: slot.x,
      y: slot.y,
      scale: m.sub ? 0.72 : 1,
      tier: 0,
    });
  }
  // Nameplates are ~60 units wide; slots can sit closer than that. Walking left to right,
  // lift a plate a row whenever it would collide with the previous one on its deck level.
  const byX = [...placed].sort((a, b) => a.x - b.x);
  for (let i = 1; i < byX.length; i++) {
    const prev = byX[i - 1], cur = byX[i];
    if (Math.abs(cur.y - prev.y) < 30 && cur.x - prev.x < 64 && cur.tier === prev.tier) cur.tier = prev.tier ? 0 : 1;
  }
  const overflow = [...extra].map(([station, count]) => {
    const last = SLOTS[station][SLOTS[station].length - 1];
    return { station, x: last.x, y: last.y - 64, count };
  });
  return { placed, overflow };
}
