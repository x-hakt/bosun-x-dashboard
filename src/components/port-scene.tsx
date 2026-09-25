"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Happening, PortFeed, PortSailor, PortShip } from "@/lib/port-core";
import type { Pose } from "@/lib/crew-scene";
import {
  assignSpots, DINGHY, errandRoute, layoutBerths, OFFICE_DOOR, planWalk, pointOf, PORT_H, PORT_W, QUAY_Y, TIDE_GAUGE, WATERLINE,
  type Berth, type Point, type Spot,
} from "@/lib/port-layout";
import { coatFor, labels, Sailor, Ship } from "@/components/crew-ship";

// IDEA-20 (BXD-85..88): the port. Sailors are live sessions and walk between town, quay and
// their ship as their state changes; dockhands and the harbour master run errands for real
// happenings (commits, finished tasks, backups, the tide reading); townsfolk, gulls, clouds
// and the lighthouse are scenery. The same component renders /activity and /crew/embed.

const DINGHY_KEY = "~dinghy";
const U = 2.3; // px per sprite unit at scale 1
const WALK = 72; // viewBox units per second
const REPLAY_MS = 10 * 60_000; // on first load, replay the last ten minutes of errands
const MAX_ERRANDS = 4;

type Folk = "sailor" | "dockhand" | "master" | "townsfolk";
type Step = Point & { then?: () => void };
interface Sprite {
  id: string;
  folk: Folk;
  x: number;
  y: number;
  s: number;
  facing: 1 | -1;
  path: Step[];
  pose: Pose;
  spot?: Spot;
  sailor?: PortSailor;
  carry?: "crate" | "barrels" | null;
  cart?: boolean;
  leaving?: boolean;
  wait?: number;
  coat?: string;
}

const sameSpot = (a?: Spot, b?: Spot) => JSON.stringify(a) === JSON.stringify(b);

// Sydney time of day for the sky: same answer on the server and in the browser.
function phaseAt(now: number): "night" | "dawn" | "day" | "dusk" {
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 6 || h >= 20 ? "night" : h < 8 ? "dawn" : h >= 18 ? "dusk" : "day";
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Non-sailor people, on the same 1-unit grid as the Sailor (feet at 0,0).
function Person({ folk, coat, pose, carry, cart }: { folk: Folk; coat: string; pose: Pose; carry?: Sprite["carry"]; cart?: boolean }) {
  const skin = folk === "townsfolk" ? "#d9a57a" : "#e8b98a";
  const dark = "#2a1f1c";
  const walking = pose === "walk";
  return (
    <g shapeRendering="crispEdges">
      {cart && (
        <g>
          <rect x={5} y={-8} width={14} height={5} fill="#6a4630" />
          <circle cx={8} cy={-2} r={2} fill="#3b2419" />
          <circle cx={16} cy={-2} r={2} fill="#3b2419" />
          {carry === "barrels" && <g><rect x={6} y={-14} width={5} height={6} rx={1} fill="#8a5a36" /><rect x={12} y={-14} width={5} height={6} rx={1} fill="#7a4b2c" /></g>}
        </g>
      )}
      <g className={walking ? "crew-leg-a" : undefined}><rect x={-3} y={-5} width={2.4} height={4} fill={dark} /></g>
      <g className={walking ? "crew-leg-b" : undefined}><rect x={0.6} y={-5} width={2.4} height={4} fill={dark} /></g>
      <rect x={-4} y={-12} width={8} height={7} fill={coat} />
      {folk === "dockhand" && <rect x={-4} y={-12} width={2} height={7} fill="#5a3b2a" />}
      <rect x={-5} y={-11} width={1.6} height={5} fill={coat} />
      <rect x={3.4} y={carry === "crate" && !cart ? -18 : -11} width={1.6} height={carry === "crate" && !cart ? 7 : 5} fill={coat} />
      <rect x={-3} y={-17} width={6} height={5} fill={skin} />
      <rect x={1} y={-15.4} width={1} height={1} fill={dark} />
      {folk === "dockhand" && <rect x={-3.2} y={-17.6} width={6.4} height={1.6} fill="#b8322f" />}
      {folk === "master" && <g><rect x={-3.6} y={-19} width={7.2} height={2.2} fill="#1d2d44" /><rect x={-1} y={-18.6} width={2} height={1} fill="#d9b35f" /></g>}
      {folk === "townsfolk" && <rect x={-3} y={-18} width={6} height={1.4} fill="#5b4636" />}
      {carry === "crate" && !cart && <rect x={-5} y={-25} width={10} height={7} fill="#a0703f" stroke="#5a3b2a" strokeWidth={0.6} />}
    </g>
  );
}

function MooredShip({ berth, ship, alarm, crates, pennant, onBoard }: {
  berth: Berth; ship: PortShip; alarm: boolean; crates: number; pennant: boolean; onBoard: () => void;
}) {
  const { cx, scale: s } = berth;
  if (berth.offing) {
    return (
      <g transform={`translate(${cx} 334) scale(${s})`} role="button" tabIndex={0} className="port-ship" onClick={onBoard}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBoard(); } }} aria-label={`Board ${ship.name}, anchored out`}>
        <title>{ship.name}</title>
        <path d="M-100 -40 L100 -40 L86 -4 Q0 6 -86 -4 Z" fill="#3d2a22" />
        <rect x={-4} y={-220} width={8} height={180} fill="#3d2a22" />
        <path d="M-70 -200 L70 -200 L62 -110 L-62 -110 Z" fill="#b8ad93" />
      </g>
    );
  }
  const hull = ship.kind === "voyage" ? "#4d3a4f" : "#6e4530";
  return (
    <g className="port-ship" role="button" tabIndex={0} onClick={onBoard}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBoard(); } }}
      aria-label={`Board ${ship.name}${alarm ? ", someone needs you" : ""}`}>
      <title>{ship.name}</title>
      <g className="port-bob" style={{ animationDelay: `${(cx % 7) * 0.4}s` }}>
        <g transform={`translate(${cx} ${WATERLINE}) scale(${s})`}>
          {/* rigging, mast, yards, sails */}
          <g stroke="#caa877" strokeWidth={1.4 / s} opacity={0.75}>
            <line x1={0} y1={-262} x2={-100} y2={-50} />
            <line x1={0} y1={-262} x2={100} y2={-50} />
          </g>
          <rect x={-4} y={-270} width={8} height={224} fill="#5a3b2a" />
          <rect x={-66} y={-238} width={132} height={5} fill="#6a4630" />
          <rect x={-54} y={-160} width={108} height={5} fill="#6a4630" />
          <path d="M-62 -233 L62 -233 L56 -166 L-56 -166 Z" fill={ship.kind === "voyage" ? "#cfc6d8" : "#e9dcb8"} className="crew-sail" />
          <path d="M-50 -155 L50 -155 L44 -108 L-44 -108 Z" fill={ship.kind === "voyage" ? "#c2b8cc" : "#e2d2a8"} />
          <g className="crew-flag">
            <path d={alarm ? "M4 -268 L44 -259 L4 -248 Z" : "M4 -268 L34 -262 L4 -255 Z"} fill={alarm ? "#d23b3b" : "#a8363a"} />
            {alarm && <text x={20} y={-254} className="port-alarm">!</text>}
          </g>
          {pennant && <path d="M-4 -120 L-34 -114 L-4 -108 Z" fill="#f4cf83" className="port-pennant" />}
          {/* hull */}
          <path d="M-105 -46 L105 -46 L90 -6 Q0 6 -90 -6 Z" fill={hull} />
          <rect x={-107} y={-50} width={214} height={6} fill="#b98050" />
          <line x1={-96} y1={-26} x2={96} y2={-26} stroke="#5a3826" strokeWidth={2} />
          {[-60, -20, 20, 60].map((x) => <circle key={x} cx={x} cy={-16} r={4} fill="#15384a" stroke="#d9b35f" strokeWidth={1.5} />)}
          {/* cargo delivered by dockhands */}
          {Array.from({ length: Math.min(4, crates) }, (_, i) => (
            <rect key={i} x={50 + (i % 2) * 13} y={-60 - Math.floor(i / 2) * 10} width={12} height={10} fill="#a0703f" stroke="#5a3b2a" strokeWidth={1} />
          ))}
        </g>
      </g>
      {/* gangplank down to the quay */}
      <line x1={berth.plankTop.x} y1={berth.plankTop.y} x2={berth.plankFoot.x} y2={QUAY_Y - 1} stroke="#8a5a36" strokeWidth={5} strokeLinecap="round" />
    </g>
  );
}

// The berth's sign on the quay face: drawn after the quay so the planks don't cover it.
function BerthSign({ berth, ship, onBoard }: { berth: Berth; ship: PortShip; onBoard: () => void }) {
  return (
    <g transform={`translate(${berth.cx} ${QUAY_Y + 10})`} className="port-ship" onClick={onBoard} aria-hidden="true">
      <rect x={-88} y={0} width={176} height={36} rx={4} className="port-sign" />
      <text x={0} y={15} textAnchor="middle" className="port-sign-name">{ship.name.length > 22 ? `${ship.name.slice(0, 21)}…` : ship.name}</text>
      <text x={0} y={29} textAnchor="middle" className="port-sign-stats">
        {ship.todo === null ? "private voyage" : `${ship.inProgress} underway · ${ship.todo} to do`}
      </text>
    </g>
  );
}

function Scenery({ phase }: { phase: ReturnType<typeof phaseAt> }) {
  const night = phase === "night";
  const lit = night || phase === "dusk";
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="port-sky" x1="0" y1="0" x2="0" y2="1">
          {phase === "night" && <><stop offset="0" stopColor="#060f1f" /><stop offset="1" stopColor="#16304a" /></>}
          {phase === "dawn" && <><stop offset="0" stopColor="#3a4a78" /><stop offset="1" stopColor="#e6a27a" /></>}
          {phase === "day" && <><stop offset="0" stopColor="#4d93c0" /><stop offset="1" stopColor="#bfe3ef" /></>}
          {phase === "dusk" && <><stop offset="0" stopColor="#2c2f5e" /><stop offset="1" stopColor="#d9825b" /></>}
        </linearGradient>
        <linearGradient id="port-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "#0f2f45" : "#2a6f8a"} />
          <stop offset="1" stopColor={night ? "#0a2233" : "#1b4d63"} />
        </linearGradient>
      </defs>
      <rect width={PORT_W} height={PORT_H} fill="url(#port-sky)" />
      {night ? (
        <g>
          <circle cx={1180} cy={90} r={26} fill="#f1e6c4" />
          <circle cx={1192} cy={82} r={24} fill="#0b1a2e" opacity={0.85} />
          {[[120, 60], [260, 120], [420, 40], [640, 90], [760, 30], [900, 140], [1020, 60], [1320, 110], [1450, 40], [1540, 150]].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={2} height={2} fill="#f4ecd2" className="port-star" style={{ animationDelay: `${(x % 5) * 0.7}s` }} />
          ))}
        </g>
      ) : (
        <circle cx={phase === "day" ? 1180 : phase === "dawn" ? 1380 : 240} cy={phase === "day" ? 90 : 250} r={34} fill={phase === "day" ? "#fff1b8" : "#ffc98a"} />
      )}
      {!night && (
        <g opacity={0.9}>
          {[[160, 90, 0], [620, 60, -30], [1000, 120, -60]].map(([x, y, d]) => (
            <g key={x} className="port-cloud" style={{ animationDelay: `${d}s` }}>
              <g transform={`translate(${x} ${y})`} fill="#f7f3e8" opacity={0.85}>
                <rect x={0} y={8} width={90} height={16} rx={8} /><rect x={18} y={0} width={46} height={16} rx={8} />
              </g>
            </g>
          ))}
        </g>
      )}
      {/* gulls */}
      {[0, 1, 2].map((i) => (
        <g key={i} className="port-gull" style={{ animationDelay: `${i * -7}s`, animationDuration: `${22 + i * 6}s` }}>
          <path d={`M0 ${120 + i * 40} q6 -6 12 0 q6 -6 12 0`} fill="none" stroke={night ? "#9fb3c4" : "#f4f1ea"} strokeWidth={2.2} className="port-wing" />
        </g>
      ))}
      {/* far shore and lighthouse */}
      <path d="M0 330 Q200 300 420 320 T900 318 T1300 322 T1600 316 L1600 334 L0 334 Z" fill={night ? "#10243a" : "#5b7f8f"} opacity={0.8} />
      <g transform="translate(1580 330)">
        <path d="M-34 4 Q0 -20 34 4 Z" fill={night ? "#1c2a36" : "#6d6258"} />
        <path d="M-8 -6 L8 -6 L6 -62 L-6 -62 Z" fill="#efe7d6" />
        <rect x={-6} y={-40} width={12} height={8} fill="#b8322f" />
        <rect x={-6} y={-20} width={12} height={8} fill="#b8322f" />
        <rect x={-5} y={-72} width={10} height={10} fill={lit ? "#ffe39a" : "#cfd8dc"} />
        {lit && <path d="M0 -67 L-190 -92 L-190 -42 Z" fill="#ffe39a" opacity={0.22} className="port-beam" />}
      </g>
      {/* the harbour's water */}
      <rect x={0} y={330} width={PORT_W} height={PORT_H - 330} fill="url(#port-sea)" />
      <g className="crew-sea" opacity={0.5}>
        <path d="M-100 380 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" fill="none" stroke="#8fc3d4" strokeWidth={1.5} />
      </g>
    </g>
  );
}

function Town({ phase, bell, glint }: { phase: ReturnType<typeof phaseAt>; bell: boolean; glint: boolean }) {
  const lit = phase === "night" || phase === "dusk";
  const win = lit ? "#ffd27a" : "#2d3e4c";
  return (
    <g aria-hidden="true">
      {/* houses behind */}
      {[[20, 300, 70, "#8c5b4a"], [96, 310, 60, "#6f7f8c"], [300, 305, 64, "#9a7b55"], [360, 318, 56, "#7d6a8a"]].map(([x, y, w, c]) => (
        <g key={`${x}`}>
          <rect x={x as number} y={y as number} width={w as number} height={470 - (y as number)} fill={c as string} />
          <path d={`M${(x as number) - 6} ${y} L${(x as number) + (w as number) / 2} ${(y as number) - 26} L${(x as number) + (w as number) + 6} ${y} Z`} fill="#5a3b2a" />
          <rect x={(x as number) + 12} y={(y as number) + 16} width={10} height={12} fill={win} />
          <rect x={(x as number) + (w as number) - 24} y={(y as number) + 16} width={10} height={12} fill={win} />
        </g>
      ))}
      {/* warehouse (the backups go here) */}
      <rect x={40} y={352} width={170} height={118} fill="#7a4b2c" />
      <path d="M32 352 L125 312 L218 352 Z" fill="#4e3020" />
      <rect x={104} y={402} width={48} height={68} fill="#3b2419" />
      <text x={125} y={386} textAnchor="middle" className="port-house-text">WAREHOUSE</text>
      <g className="port-smoke"><circle cx={70} cy={318} r={6} /><circle cx={76} cy={300} r={8} /><circle cx={70} cy={280} r={10} /></g>
      <rect x={62} y={318} width={14} height={24} fill="#4e3020" />
      {/* harbour master's office, with the bell */}
      <rect x={228} y={380} width={78} height={90} fill="#d9c9a3" />
      <path d="M222 380 L267 350 L312 380 Z" fill="#8a3b33" />
      <rect x={252} y={420} width={22} height={50} fill="#5a3b2a" />
      <rect x={236} y={394} width={12} height={12} fill={win} />
      <rect x={286} y={394} width={12} height={12} fill={win} />
      <text x={267} y={416} textAnchor="middle" className="port-house-text-small">HARBOUR</text>
      <g transform="translate(267 350)">
        <rect x={-10} y={-28} width={20} height={4} fill="#5a3b2a" />
        <rect x={-9} y={-24} width={2} height={20} fill="#5a3b2a" /><rect x={7} y={-24} width={2} height={20} fill="#5a3b2a" />
        <g className={bell ? "port-bell port-bell-ring" : "port-bell"}><path d="M-5 -22 Q0 -26 5 -22 L6 -12 L-6 -12 Z" fill="#d9b35f" /></g>
      </g>
      {bell && <text x={292} y={322} className="port-ding">ding!</text>}
      {/* market stalls */}
      {[[330, "#b8322f"], [380, "#2a9d8f"]].map(([x, c]) => (
        <g key={x as number}>
          <rect x={(x as number)} y={440} width={40} height={30} fill="#8a5a36" />
          <path d={`M${(x as number) - 4} 440 L${(x as number) + 44} 440 L${(x as number) + 38} 426 L${(x as number) + 2} 426 Z`} fill={c as string} />
          <rect x={(x as number) + 6} y={448} width={8} height={6} fill="#e0a23a" /><rect x={(x as number) + 20} y={448} width={8} height={6} fill="#7cb342" />
        </g>
      ))}
      {/* ground, quay, pilings */}
      <rect x={0} y={470} width={440} height={PORT_H - 470} fill="#6b6259" />
      <rect x={420} y={470} width={PORT_W - 420} height={24} fill="#9a6a42" />
      <g stroke="#6e4a2e" strokeWidth={1}>{Array.from({ length: 30 }, (_, i) => <line key={i} x1={440 + i * 40} y1={470} x2={440 + i * 40} y2={494} />)}</g>
      {Array.from({ length: 15 }, (_, i) => <rect key={i} x={452 + i * 80} y={494} width={10} height={60} fill="#4a3322" />)}
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={500 + i * 112} y={460} width={9} height={10} rx={2} fill="#2f2f2f" />)}
      {/* tide gauge */}
      <g transform={`translate(${TIDE_GAUGE.x + 14} 470)`}>
        <rect x={-3} y={-40} width={6} height={100} fill="#efe7d6" />
        {[-34, -22, -10, 2, 14, 26, 38].map((y) => <rect key={y} x={-3} y={y} width={6} height={5} fill="#b8322f" />)}
        {glint && <circle cx={0} cy={-44} r={5} className="port-glint" />}
      </g>
    </g>
  );
}

function Dinghy({ crewCount }: { crewCount: number }) {
  return (
    <g aria-hidden="true" className="port-bob" style={{ animationDuration: "3.2s" }}>
      <g stroke="#caa877" strokeWidth={3} strokeLinecap="round" className={crewCount ? "port-oars" : undefined}>
        <line x1={DINGHY.x - 46} y1={DINGHY.y - 4} x2={DINGHY.x - 84} y2={DINGHY.y + 16} />
        <line x1={DINGHY.x + 46} y1={DINGHY.y - 4} x2={DINGHY.x + 84} y2={DINGHY.y + 16} />
      </g>
      <path d={`M${DINGHY.x - 62} ${DINGHY.y - 8} L${DINGHY.x + 62} ${DINGHY.y - 8} L${DINGHY.x + 50} ${DINGHY.y + 12} Q${DINGHY.x} ${DINGHY.y + 18} ${DINGHY.x - 50} ${DINGHY.y + 12} Z`} fill="#7a4b2c" />
      <rect x={DINGHY.x - 64} y={DINGHY.y - 12} width={128} height={5} fill="#b98050" />
      {/* stairs down from the quay */}
      <g fill="#6e4a2e">{[0, 1, 2, 3].map((i) => <rect key={i} x={DINGHY.stairsX - 10 + i * 6} y={494 + i * 12} width={22} height={5} />)}</g>
    </g>
  );
}

// Everyone already at their place on the first render, server and client alike: no parade.
function initialWorld(feed: PortFeed, berths: Berth[]) {
  const sprites = new Map<string, Sprite>();
  const targets = assignSpots(feed.sailors, berths, DINGHY_KEY);
  for (const s of feed.sailors) {
    const t = targets.get(s.id);
    if (!t) continue;
    const p = pointOf(t.spot, berths);
    sprites.set(s.id, { id: s.id, folk: "sailor", ...p, facing: 1, path: [], pose: t.pose, spot: t.spot, sailor: s });
  }
  const coats = ["#7d8a8f", "#9b7a5a", "#6f7d5a", "#8a6f86"];
  [60, 190, 318, 395].forEach((x, i) => sprites.set(`town-${i}`, { id: `town-${i}`, folk: "townsfolk", x, y: QUAY_Y, s: 0.95, facing: i % 2 ? -1 : 1, path: [], pose: "rest", wait: 1 + i * 1.7, coat: coats[i] }));
  sprites.set("master", { id: "master", folk: "master", ...OFFICE_DOOR, s: 1, facing: 1, path: [], pose: "rest", coat: "#26456e" });
  // Errands older than the replay window are treated as already run.
  const seen = new Set(feed.happenings.filter((h) => feed.now - Date.parse(h.at) > REPLAY_MS).map((h) => h.id));
  return { sprites, seen, queue: [] as Happening[] };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function PortScene({ feed, onBoard }: { feed: PortFeed; onBoard: (key: string) => void }) {
  const reduced = useReducedMotion();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const phase = phaseAt(feed.now);
  const moorable = useMemo(() => feed.ships.filter((s) => s.kind !== "dinghy"), [feed.ships]);
  const berths = useMemo(() => layoutBerths(moorable.map((s) => s.key)), [moorable]);
  const berthsRef = useRef(berths);
  // The moving world: mutable on purpose (the animation loop writes positions straight to
  // the DOM), created once from the first feed so the server and client render the same.
  const [world] = useState(() => initialWorld(feed, berths));
  const els = useRef(new Map<string, SVGGElement>());
  const [bellUntil, setBellUntil] = useState(0);
  const [glintUntil, setGlintUntil] = useState(0);
  const [crates, setCrates] = useState<Record<string, number>>({});
  const [pennants, setPennants] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(feed.now);
  const frame = useRef<HTMLDivElement>(null);

  const place = (sp: Sprite) => {
    const el = els.current.get(sp.id);
    if (!el) return;
    el.setAttribute("transform", `translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})`);
    (el.firstElementChild as SVGGElement | null)?.setAttribute("transform", `scale(${(U * sp.s * sp.facing).toFixed(3)} ${(U * sp.s).toFixed(3)})`);
  };

  // Each refresh: walk sailors to their new places, send the departed into town, queue errands.
  useEffect(() => {
    berthsRef.current = berths;
    const map = world.sprites;
    const targets = assignSpots(feed.sailors, berths, DINGHY_KEY);
    const present = new Set<string>();
    for (const s of feed.sailors) {
      const t = targets.get(s.id);
      if (!t) continue;
      present.add(s.id);
      let sp = map.get(s.id);
      if (!sp) {
        const start = reduced ? pointOf(t.spot, berths) : pointOf({ zone: "town" }, berths);
        sp = { id: s.id, folk: "sailor", ...start, facing: 1, path: [], pose: t.pose, spot: reduced ? t.spot : { zone: "town" }, sailor: s };
        map.set(s.id, sp);
      }
      sp.sailor = s;
      sp.pose = t.pose;
      sp.leaving = false;
      if (!sameSpot(sp.spot, t.spot)) {
        if (reduced) Object.assign(sp, pointOf(t.spot, berths), { path: [] });
        else sp.path = planWalk(sp.spot ?? { zone: "town" }, t.spot, berths);
        sp.spot = t.spot;
      }
    }
    for (const sp of map.values()) {
      if (sp.folk !== "sailor" || present.has(sp.id) || sp.leaving) continue;
      if (reduced) { map.delete(sp.id); continue; }
      sp.leaving = true;
      const id = sp.id;
      const route: Step[] = planWalk(sp.spot ?? { zone: "town" }, { zone: "town" }, berths);
      route[route.length - 1] = { ...route[route.length - 1], then: () => { map.delete(id); bump(); } };
      sp.path = route;
      sp.spot = { zone: "town" };
    }
    for (const h of feed.happenings) {
      if (world.seen.has(h.id)) continue;
      world.seen.add(h.id);
      if (h.kind !== "arrival" && h.kind !== "departure") world.queue.push(h);
    }
    bump();
  }, [feed, berths, reduced, world]);

  // The errand runner: a few at a time, one every 1.5 s.
  useEffect(() => {
    if (reduced) { world.queue.splice(0); return; }
    const timer = window.setInterval(() => {
      setClock(Date.now());
      const map = world.sprites;
      const busy = [...map.values()].filter((sp) => sp.folk === "dockhand").length;
      const h = world.queue[0];
      if (!h) return;
      const route = (kind: "cargo" | "delivery" | "cart" | "tide") => errandRoute(kind, berthsRef.current, h.ship) as Step[];
      if (h.kind === "bell") { world.queue.shift(); setBellUntil(Date.now() + 3000); return; }
      if (h.kind === "tide") {
        const master = map.get("master")!;
        if (master.path.length) return;
        world.queue.shift();
        const r = route("tide");
        r[1] = { ...r[1], then: () => setGlintUntil(Date.now() + 2500) };
        master.path = r.slice(1);
        bump();
        return;
      }
      if (busy >= MAX_ERRANDS) return;
      world.queue.shift();
      const id = `hand-${h.id}`;
      const r = route(h.kind === "cart" ? "cart" : h.kind === "delivery" ? "delivery" : "cargo");
      const hand: Sprite = { id, folk: "dockhand", ...r[0], facing: 1, path: [], pose: "rest", coat: "#8f6b43", carry: h.kind === "cargo" ? "crate" : null, cart: h.kind === "cart" };
      const ship = h.ship;
      r[1] = { ...r[1], then: () => {
        if (h.kind === "cargo" && ship) { hand.carry = null; setCrates((c) => ({ ...c, [ship]: (c[ship] ?? 0) + 1 })); }
        if (h.kind === "delivery") hand.carry = "crate";
        if (h.kind === "cart") hand.carry = "barrels";
        bump();
      } };
      r[2] = { ...r[2], then: () => { map.delete(id); bump(); } };
      hand.path = r.slice(1);
      if (h.kind === "delivery" && ship) setPennants((p) => ({ ...p, [ship]: Date.now() + 9000 }));
      map.set(id, hand);
      bump();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [reduced, world]);

  // Movement: one animation frame loop moves everyone along their waypoints.
  useEffect(() => {
    if (reduced) return;
    const rand = mulberry(7);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let changed = false;
      for (const sp of world.sprites.values()) {
        if (!sp.path.length && sp.folk === "townsfolk") {
          sp.wait = (sp.wait ?? 0) - dt;
          if (sp.wait <= 0) {
            sp.path = [{ x: 24 + rand() * 390, y: QUAY_Y, s: 0.95 }];
            sp.wait = 2 + rand() * 5;
            changed = true;
          }
        }
        if (!sp.path.length) continue;
        const next = sp.path[0];
        const dx = next.x - sp.x;
        const dy = next.y - sp.y;
        const dist = Math.hypot(dx, dy);
        const speed = WALK * (sp.folk === "townsfolk" ? 0.45 : sp.cart ? 0.7 : sp.sailor?.sub ? 1.35 : 1) * Math.max(0.5, sp.s);
        if (Math.abs(dx) > 0.5) sp.facing = dx > 0 ? 1 : -1;
        if (dist <= speed * dt) {
          sp.x = next.x; sp.y = next.y; sp.s = next.s;
          sp.path.shift();
          next.then?.();
          if (!sp.path.length) changed = true;
        } else {
          const f = (speed * dt) / dist;
          sp.x += dx * f; sp.y += dy * f; sp.s += (next.s - sp.s) * f;
        }
        place(sp);
      }
      if (changed) bump();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, world]);

  // Crates are unloaded and pennants lowered after a while.
  useEffect(() => {
    const t = window.setInterval(() => setCrates((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.max(0, v - 1)]).filter(([, v]) => (v as number) > 0))), 45_000);
    return () => window.clearInterval(t);
  }, []);

  // On a narrow screen the port pans; start with the first ship that needs you (or the quay) in view.
  useEffect(() => {
    const el = frame.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const focus = feed.sailors.find((s) => s.state === "needs_approval")?.ship;
    const berth = berths.find((b) => b.key === focus && !b.offing) ?? berths[0];
    const x = berth ? berth.cx : 700;
    el.scrollLeft = (x / PORT_W) * el.scrollWidth - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shipsByKey = new Map(feed.ships.map((s) => [s.key, s]));
  const all = [...world.sprites.values()].sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
  const onDeck = all.filter((sp) => sp.folk === "sailor" && sp.spot?.zone === "deck" && !sp.path.length);
  const rest = all.filter((sp) => !onDeck.includes(sp));
  const dinghyCrew = feed.sailors.filter((s) => s.ship === DINGHY_KEY).length;
  const offingCount = (key: string) => feed.sailors.filter((s) => s.ship === key).length;

  const figure = (sp: Sprite) => {
    const walking = sp.path.length > 0;
    const pose: Pose = walking ? "walk" : sp.pose;
    const m = sp.sailor;
    const body = m
      ? <Sailor pose={pose} coat={coatFor(m.name)} sub={m.sub} />
      : <Person folk={sp.folk} coat={sp.coat ?? "#777"} pose={pose} carry={sp.carry} cart={sp.cart} />;
    const tip = m ? `${m.name} · ${labels[m.state]} · ${shipsByKey.get(m.ship)?.name ?? ""}${m.detail ? ` · ${m.detail}` : ""}`
      : sp.folk === "dockhand" ? "Dockhand on a real errand" : sp.folk === "master" ? "Harbour master (reads the tide gauge every 5 minutes)" : "Townsfolk (scenery)";
    const inner = (
      <g
        ref={(el) => { if (el) { els.current.set(sp.id, el); place(sp); } else els.current.delete(sp.id); }}
        transform={`translate(${sp.x} ${sp.y})`}
        className={m ? `crew-figure crew-${m.state}${walking ? " port-walking" : ""}` : "port-folk"}
      >
        <title>{tip}</title>
        <g transform={`scale(${U * sp.s * sp.facing} ${U * sp.s})`}>{body}</g>
        {m?.state === "needs_approval" && !walking && (
          <g transform={`translate(10 ${-54 * sp.s})`}><g className="crew-bubble">
            <rect x={-7} y={-12} width={14} height={16} rx={3} fill="#fff4d6" stroke="#2a1f1c" strokeWidth={1.2} />
            <text x={0} y={1} textAnchor="middle" className="crew-bubble-text">!</text>
          </g></g>
        )}
        {m && pose === "sleep" && <text x={8} y={-16} className="crew-zzz">z<tspan dx={2} dy={-5}>z</tspan></text>}
      </g>
    );
    return m?.href ? <a key={sp.id} href={m.href} aria-label={`${m.name}: ${labels[m.state]}`}>{inner}</a> : <g key={sp.id}>{inner}</g>;
  };

  return (
    <div className="port-frame" ref={frame}>
      <svg className="port-svg" viewBox={`0 0 ${PORT_W} ${PORT_H}`} role="img" aria-label="The port: each live agent session is a sailor on or beside its project's ship">
        <Scenery phase={phase} />
        {berths.filter((b) => b.offing).map((b) => {
          const ship = shipsByKey.get(b.key)!;
          return <g key={b.key}><MooredShip berth={b} ship={ship} alarm={false} crates={0} pennant={false} onBoard={() => onBoard(b.key)} />
            <text x={b.cx} y={346} textAnchor="middle" className="port-offing-text">{offingCount(b.key)} aboard</text></g>;
        })}
        {berths.filter((b) => !b.offing).map((b) => {
          const ship = shipsByKey.get(b.key)!;
          return <MooredShip key={b.key} berth={b} ship={ship} crates={crates[b.key] ?? 0} pennant={(pennants[b.key] ?? 0) > clock}
            alarm={feed.sailors.some((s) => s.ship === b.key && s.state === "needs_approval")} onBoard={() => onBoard(b.key)} />;
        })}
        <g>{onDeck.map(figure)}</g>
        <Town phase={phase} bell={bellUntil > clock} glint={glintUntil > clock} />
        {berths.filter((b) => !b.offing).map((b) => <BerthSign key={b.key} berth={b} ship={shipsByKey.get(b.key)!} onBoard={() => onBoard(b.key)} />)}
        {feed.ships.some((s) => s.kind === "dinghy") && (
          <g role="button" tabIndex={0} className="port-ship" aria-label="Board the rowing boat: sessions with no project"
            onClick={() => onBoard(DINGHY_KEY)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBoard(DINGHY_KEY); } }}>
            <title>Rowing boat: sessions with no project</title>
            <Dinghy crewCount={dinghyCrew} />
          </g>
        )}
        <g>{rest.map(figure)}</g>
        {moorable.length === 0 && feed.sailors.length === 0 && (
          <g transform="translate(900 250)">
            <rect x={-230} y={-26} width={460} height={44} rx={8} fill="#f1e2bc" stroke="#6a4630" strokeWidth={3} />
            <text x={0} y={2} textAnchor="middle" className="crew-empty-text">Quiet harbour · no ship has shown a signal in the last 3 hours</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// The page-level wrapper: harbour or a boarded ship, the legend, a readable berth list
// (the scene's text is small on a phone), and the screen-reader roster.
export function PortView({ feed }: { feed: PortFeed }) {
  const [selected, setSelected] = useState("harbour");
  const ship = feed.ships.find((s) => s.key === selected);
  const current = ship ? selected : "harbour";
  const crewOf = (key: string) => feed.sailors.filter((s) => s.ship === key);
  const deck = ship ? crewOf(ship.key).map((s) => ({ alias: s.name, project: ship.name, state: s.state, updated: s.since, href: s.href, sub: s.sub })) : [];
  return (
    <section className="crew-scene" aria-label="Bosun port activity">
      <div className="crew-harbour">
        <span className="crew-harbour-title">{ship ? `ABOARD · ${ship.name.toUpperCase()}` : "THE PORT"}</span>
        <div className="crew-filters" aria-label="Choose a ship">
          <button type="button" aria-pressed={current === "harbour"} onClick={() => setSelected("harbour")}>Harbour <small>{feed.sailors.length}</small></button>
          {feed.ships.map((s) => (
            <button type="button" key={s.key} aria-pressed={current === s.key} onClick={() => setSelected(s.key)}>{s.name} <small>{crewOf(s.key).length}</small></button>
          ))}
        </div>
      </div>
      {ship ? <div className="crew-frame"><Ship crew={deck} /></div> : <PortScene feed={feed} onBoard={setSelected} />}
      <p className="crew-key" aria-hidden="true">
        <span>on deck: working</span><span>at a gun: tool running</span><span>on the quay: ready</span><span>waving on the quay: needs you</span><span>asleep: signal stale</span>
      </p>
      <p className="crew-key" aria-hidden="true">
        <span>dockhands and the harbour master run real errands: commits, finished tasks, backups, the 5-minute tide reading</span><span>townsfolk, gulls and weather are scenery</span>
      </p>
      {!ship && feed.ships.length > 0 && (
        <div className="crew-orders" aria-label="Ships in port">
          {feed.ships.map((s) => {
            const crew = crewOf(s.key);
            const needs = crew.filter((c) => c.state === "needs_approval").length;
            return (
              <button type="button" className="crew-order port-order" key={s.key} onClick={() => setSelected(s.key)}>
                <strong>{s.name}</strong>
                <span>{crew.length} aboard{needs ? <b> · {needs} need{needs === 1 ? "s" : ""} you</b> : null}{s.todo !== null ? ` · ${s.inProgress} underway · ${s.todo} to do` : ""}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="crew-caption">{feed.publicView ? "Public view · aliases only, private work shown as anonymous voyages · updates every 10 seconds" : "Live session signals · positions and errands reflect observed events"}</p>
      <div className="sr-only" role="status">
        {feed.sailors.length ? feed.sailors.map((s) => `${s.name} on ${feed.ships.find((x) => x.key === s.ship)?.name ?? "a ship"}: ${labels[s.state]}`).join(". ") : "No live agents right now."}
      </div>
    </section>
  );
}
