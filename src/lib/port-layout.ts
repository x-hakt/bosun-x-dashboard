// IDEA-20 (BXD-85, BXD-89..93): the port's geometry. Where each ship moors, where a sailor
// stands for their state, the walk between two spots (deck, gangplank, quay, dinghy, town),
// and the camera for boarding a ship. Pure, so the walk director only follows waypoints;
// tested by scripts/test/port-layout.test.mjs.
//
// Side view, viewBox 1600 × 770: the town on the left, the quay across the middle with the
// active ships moored behind it (gangplanks down to the quay), and the bay in front of the
// quay where every quiet project rides at a mooring, two rows deep. The rowing boat is tied
// up by the town stairs.

import type { Pose } from "@/lib/crew-scene";
import type { CrewState } from "@/lib/activity-state";

export const PORT_W = 1600;
export const PORT_H = 770;
export const QUAY_Y = 470; // feet on the quay (and in town)
export const WATERLINE = 410; // where hulls at the quay meet the water
export const TOWN_EXIT = { x: -30, y: QUAY_Y }; // off the left edge, into town
export const WAREHOUSE_DOOR = { x: 128, y: QUAY_Y };
export const OFFICE_DOOR = { x: 262, y: QUAY_Y };
export const TIDE_GAUGE = { x: 446, y: QUAY_Y };
export const DINGHY = { x: 560, y: 612, stairsX: 486 }; // out below the quay, clear of the berth signs
const BERTH_X0 = 470;
const BERTH_X1 = 1560;
const SHIP_W = 210; // hull width at scale 1
export const MAX_BERTHS = 8;
const MOORING_X0 = 660;
const MOORING_X1 = 1560;
export const MOORING_ROWS = [
  { waterline: 648, scale: 0.3 },
  { waterline: 742, scale: 0.34 },
];

export interface Berth {
  key: string;
  cx: number;
  scale: number;
  deckY: number; // feet on deck
  plankTop: { x: number; y: number };
  plankFoot: { x: number; y: number };
  moored: boolean; // out in the bay: a quiet ship, sails furled, no gangplank
  waterline: number;
  room: number; // width available for its name label
}

// Active ships at the quay (as many as fit, smaller when crowded); the rest at moorings.
export function layoutBerths(activeKeys: string[], quietKeys: string[] = []): Berth[] {
  const quay = activeKeys.slice(0, MAX_BERTHS);
  const quiet = [...activeKeys.slice(MAX_BERTHS), ...quietKeys];
  const span = BERTH_X1 - BERTH_X0;
  const scale = Math.min(1, span / (Math.max(1, quay.length) * SHIP_W * 1.08));
  const pitch = span / Math.max(1, quay.length);
  const berths: Berth[] = quay.map((key, i) => {
    const cx = BERTH_X0 + pitch * (i + 0.5);
    const deckY = WATERLINE - 46 * scale;
    const top = { x: cx - 78 * scale, y: deckY };
    return { key, cx, scale, deckY, plankTop: top, plankFoot: { x: top.x - 34 * scale, y: QUAY_Y }, moored: false, waterline: WATERLINE, room: 176 };
  });
  // Moorings: alternate rows, so neighbours in the list sit apart and names don't collide.
  const perRow = Math.max(1, Math.ceil(quiet.length / MOORING_ROWS.length));
  const mPitch = (MOORING_X1 - MOORING_X0) / perRow;
  quiet.forEach((key, i) => {
    const row = MOORING_ROWS[i % MOORING_ROWS.length];
    const col = Math.floor(i / MOORING_ROWS.length);
    const cx = MOORING_X0 + mPitch * (col + 0.5) + (i % MOORING_ROWS.length ? mPitch / 2 : 0) - mPitch / 4;
    const deckY = row.waterline - 46 * row.scale;
    berths.push({ key, cx, scale: row.scale, deckY, plankTop: { x: cx, y: deckY }, plankFoot: { x: cx, y: deckY }, moored: true, waterline: row.waterline, room: mPitch - 10 });
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
const DINGHY_SEATS = [-26, 0, 26, -13]; // thwarts, from the boat's centre

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
  for (const [ship, crew] of byShip) {
    if (ship === dinghyKey) {
      crew.forEach((s, i) => out.set(s.id, { spot: { zone: "dinghy", x: DINGHY.x + DINGHY_SEATS[i % DINGHY_SEATS.length] }, pose: s.state === "stale" ? "doze" : "rest" }));
      continue;
    }
    const berth = berths.find((b) => b.key === ship);
    if (!berth || berth.moored) continue;
    let deck = 0;
    let quay = 0;
    for (const s of crew) {
      if (s.state === "ready_for_prompt" || s.state === "needs_approval") {
        const x = berth.plankFoot.x + QUAY_OFFSETS[quay++ % QUAY_OFFSETS.length];
        out.set(s.id, { spot: { zone: "quay", x }, pose: s.state === "needs_approval" ? "call" : "rest" });
      } else {
        const x = berth.cx + DECK_OFFSETS[deck++ % DECK_OFFSETS.length] * berth.scale;
        out.set(s.id, { spot: { zone: "deck", ship, x }, pose: s.state === "stale" ? "doze" : s.state === "waiting_for_tool" ? "fire" : "haul" });
      }
    }
  }
  return out;
}

export function pointOf(spot: Spot, berths: Berth[]): Point {
  switch (spot.zone) {
    case "town": return { ...TOWN_EXIT, s: 1 };
    case "quay": return { x: spot.x, y: QUAY_Y, s: 1 };
    case "dinghy": return { x: spot.x, y: DINGHY.y + 2, s: 0.9 }; // feet inside the boat, below the gunwale
    case "deck": {
      const b = berths.find((x) => x.key === spot.ship);
      return b ? { x: spot.x, y: b.deckY, s: b.scale } : { ...TOWN_EXIT, s: 1 };
    }
  }
}

// The walk from one spot to another, as waypoints after the start: along the quay, up or
// down a gangplank, down the stairs to the rowing boat. A ship that has left is treated as town.
export function planWalk(from: Spot, to: Spot, berths: Berth[]): Point[] {
  const berth = (s: Spot) => (s.zone === "deck" ? berths.find((b) => b.key === s.ship && !b.moored) : undefined);
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
  return leg.filter((p, i) => i === 0 || p.x !== leg[i - 1].x || p.y !== leg[i - 1].y);
}

// Errands for real happenings: the dockhand's route out and back, from the warehouse.
export function errandRoute(kind: "cargo" | "delivery" | "cart" | "tide", berths: Berth[], ship?: string): Point[] {
  if (kind === "tide") return [{ ...OFFICE_DOOR, s: 1 }, { ...TIDE_GAUGE, s: 1 }, { ...OFFICE_DOOR, s: 1 }];
  const b = berths.find((x) => x.key === ship && !x.moored);
  const target = b ? { ...b.plankFoot, s: 1 } : { x: 900, y: QUAY_Y, s: 1 };
  return [{ ...WAREHOUSE_DOOR, s: 1 }, target, { ...WAREHOUSE_DOOR, s: 1 }];
}

// BXD-89: the camera. The whole port, or a window around one ship (or the rowing boat),
// always at the port's aspect ratio so the frame never changes height.
export type Camera = { x: number; y: number; w: number; h: number };
export const HARBOUR_CAMERA: Camera = { x: 0, y: 0, w: PORT_W, h: PORT_H };
export function cameraFor(key: string | null, berths: Berth[], dinghyKey: string): Camera {
  if (!key) return HARBOUR_CAMERA;
  const frame = (cx: number, cy: number, w: number): Camera => {
    const h = (w * PORT_H) / PORT_W;
    return { x: Math.min(PORT_W - w, Math.max(0, cx - w / 2)), y: Math.min(PORT_H - h, Math.max(0, cy - h / 2)), w, h };
  };
  if (key === dinghyKey) return frame(DINGHY.x, DINGHY.y - 50, 460);
  const b = berths.find((x) => x.key === key);
  if (!b) return HARBOUR_CAMERA;
  if (b.moored) return frame(b.cx, b.waterline - 70, 620);
  return frame(b.cx, 330, 760); // mast top to the quay signs
}
