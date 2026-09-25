// IDEA-20 (BXD-85): the port's geometry. Where each ship moors, where a sailor stands for
// their state, and the walk between two spots (deck, gangplank, quay, dinghy, town). Pure,
// so the walk director only follows waypoints; tested by scripts/test/port-layout.test.mjs.
//
// Side view, viewBox 1600 × 620: the town on the left, the quay along the front, ships
// moored behind it with gangplanks down to the quay, a rowing boat in the foreground water.

import type { Pose } from "@/lib/crew-scene";
import type { CrewState } from "@/lib/activity-state";

export const PORT_W = 1600;
export const PORT_H = 620;
export const QUAY_Y = 470; // feet on the quay (and in town)
export const WATERLINE = 410; // where moored hulls meet the water
export const TOWN_EXIT = { x: -30, y: QUAY_Y }; // off the left edge, into town
export const WAREHOUSE_DOOR = { x: 128, y: QUAY_Y };
export const OFFICE_DOOR = { x: 262, y: QUAY_Y };
export const TIDE_GAUGE = { x: 446, y: QUAY_Y };
export const DINGHY = { x: 1330, y: 560, stairsX: 1270 };
const BERTH_X0 = 470;
const BERTH_X1 = 1560;
const SHIP_W = 210; // hull width at scale 1
export const MAX_BERTHS = 6;

export interface Berth {
  key: string;
  cx: number;
  scale: number;
  deckY: number; // feet on deck
  plankTop: { x: number; y: number };
  plankFoot: { x: number; y: number };
  offing: boolean; // anchored out on the horizon: too many ships to moor
}

export function layoutBerths(keys: string[]): Berth[] {
  const moored = keys.slice(0, MAX_BERTHS);
  const span = BERTH_X1 - BERTH_X0;
  const scale = Math.min(1, span / (Math.max(1, moored.length) * SHIP_W * 1.08));
  const pitch = span / Math.max(1, moored.length);
  const berths: Berth[] = moored.map((key, i) => {
    const cx = BERTH_X0 + pitch * (i + 0.5);
    const deckY = WATERLINE - 46 * scale;
    const top = { x: cx - 78 * scale, y: deckY };
    return { key, cx, scale, deckY, plankTop: top, plankFoot: { x: top.x - 34 * scale, y: QUAY_Y }, offing: false };
  });
  // The rest ride at anchor on the horizon, small and in a row.
  keys.slice(MAX_BERTHS).forEach((key, i) => {
    const cx = 620 + i * 90;
    berths.push({ key, cx, scale: 0.28, deckY: 318, plankTop: { x: cx, y: 318 }, plankFoot: { x: cx, y: 318 }, offing: true });
  });
  return berths;
}

export type Spot =
  | { zone: "deck"; ship: string; x: number }
  | { zone: "quay"; x: number }
  | { zone: "dinghy"; x: number }
  | { zone: "town" };

export interface Point {
  x: number;
  y: number;
  s: number; // sprite scale here
}

const DECK_OFFSETS = [-40, 10, 55, -12, 32, -62, 74]; // × scale, from the ship's centre
const QUAY_OFFSETS = [-4, 24, 52, 80, 108, -30]; // from the plank foot, along the quay

// Where each sailor goes, given their ship and state. Deterministic: sailors are placed in
// id order, so a refresh with the same crew puts everyone back where they were.
export function assignSpots(
  sailors: { id: string; ship: string; state: CrewState }[],
  berths: Berth[],
  dinghyKey: string,
): Map<string, { spot: Spot; pose: Pose }> {
  const out = new Map<string, { spot: Spot; pose: Pose }>();
  const byShip = new Map<string, typeof sailors>();
  for (const s of [...sailors].sort((a, b) => a.id.localeCompare(b.id))) byShip.set(s.ship, [...(byShip.get(s.ship) ?? []), s]);
  let dinghySeat = 0;
  for (const [ship, crew] of byShip) {
    const berth = berths.find((b) => b.key === ship);
    let deck = 0;
    let quay = 0;
    for (const s of crew) {
      if (ship === dinghyKey) {
        out.set(s.id, { spot: { zone: "dinghy", x: DINGHY.x - 36 + (dinghySeat++ % 4) * 24 }, pose: s.state === "stale" ? "sleep" : "rest" });
        continue;
      }
      if (!berth || berth.offing) continue; // out on the horizon: counted, not drawn
      const ashore = s.state === "ready_for_prompt" || s.state === "needs_approval";
      if (ashore) {
        const x = berth.plankFoot.x + QUAY_OFFSETS[quay++ % QUAY_OFFSETS.length];
        out.set(s.id, { spot: { zone: "quay", x }, pose: s.state === "needs_approval" ? "call" : "rest" });
      } else {
        const x = berth.cx + DECK_OFFSETS[deck++ % DECK_OFFSETS.length] * berth.scale;
        out.set(s.id, { spot: { zone: "deck", ship, x }, pose: s.state === "stale" ? "sleep" : s.state === "waiting_for_tool" ? "fire" : "haul" });
      }
    }
  }
  return out;
}

export function pointOf(spot: Spot, berths: Berth[]): Point {
  switch (spot.zone) {
    case "town": return { ...TOWN_EXIT, s: 1 };
    case "quay": return { x: spot.x, y: QUAY_Y, s: 1 };
    case "dinghy": return { x: spot.x, y: DINGHY.y - 8, s: 0.9 };
    case "deck": {
      const b = berths.find((x) => x.key === spot.ship);
      return b ? { x: spot.x, y: b.deckY, s: b.scale } : { ...TOWN_EXIT, s: 1 };
    }
  }
}

// The walk from one spot to another, as waypoints after the start: along the quay, up or
// down a gangplank, over the dinghy stairs. A ship that has left (no berth) is treated as town.
export function planWalk(from: Spot, to: Spot, berths: Berth[]): Point[] {
  const berth = (s: Spot) => (s.zone === "deck" ? berths.find((b) => b.key === s.ship && !b.offing) : undefined);
  const down = (s: Spot): Point[] => {
    const b = berth(s);
    if (s.zone === "deck" && b) return [{ ...b.plankTop, s: b.scale }, { ...b.plankFoot, s: 1 }];
    if (s.zone === "dinghy") return [{ x: DINGHY.stairsX, y: QUAY_Y, s: 1 }];
    return [];
  };
  const up = (s: Spot): Point[] => down(s).reverse();
  if (from.zone === "deck" && to.zone === "deck" && from.ship === to.ship) return [pointOf(to, berths)];
  if (from.zone === "dinghy" && to.zone === "dinghy") return [pointOf(to, berths)];
  const leg = [...down(from), ...up(to), pointOf(to, berths)];
  // Drop consecutive duplicates (e.g. town → quay has no stairs).
  return leg.filter((p, i) => i === 0 || p.x !== leg[i - 1].x || p.y !== leg[i - 1].y);
}

// Errands for real happenings: the dockhand's route out and back, from the warehouse.
export function errandRoute(kind: "cargo" | "delivery" | "cart" | "tide", berths: Berth[], ship?: string): Point[] {
  if (kind === "tide") return [{ ...OFFICE_DOOR, s: 1 }, { ...TIDE_GAUGE, s: 1 }, { ...OFFICE_DOOR, s: 1 }];
  const b = berths.find((x) => x.key === ship && !x.offing);
  const target = b ? { ...b.plankFoot, s: 1 } : { x: 900, y: QUAY_Y, s: 1 };
  return [{ ...WAREHOUSE_DOOR, s: 1 }, target, { ...WAREHOUSE_DOOR, s: 1 }];
}
