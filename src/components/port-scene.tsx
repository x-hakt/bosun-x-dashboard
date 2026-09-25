"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Happening, PortFeed, PortSailor, PortShip } from "@/lib/port-core";
import { clockText, entryText, PORT_TZ, shipNameOf } from "@/lib/port-text";
import type { Pose } from "@/lib/crew-scene";
import {
  assignSpots, cameraFor, DINGHY, errandRoute, HARBOUR_CAMERA, layoutBerths, OFFICE_DOOR, planWalk, pointOf, PORT_H, PORT_W, QUAY_Y, TAVERN_DOOR, TIDE_GAUGE, WATERLINE,
  type Berth, type Camera, type Point, type Spot,
} from "@/lib/port-layout";
import { coatFor, labels, lookFor, Sailor } from "@/components/crew-ship";

// IDEA-20 (BXD-85..93): the port. Every project is a ship: active ones at the quay, quiet
// ones at moorings in the bay. Sailors are live sessions with generated names, walking
// between town, quay and deck as their state changes; dockhands and the shipwright run
// errands for real happenings (commits, finished tasks, backups, the tide reading);
// townsfolk, gulls, clouds and the lighthouse are scenery. Boarding a ship glides the camera
// onto it. The same component renders /activity and /crew/embed.

const DINGHY_KEY = "~dinghy"; // port-core's DINGHY_KEY (not imported: that module is server-side)
const U = 2.3; // px per sprite unit at scale 1
const WALK = 72; // viewBox units per second
const REPLAY_MS = 10 * 60_000; // on first load, replay the last ten minutes of errands
const MAX_ERRANDS = 4;
const FRESH_MS = 8_000; // a nameplate shows this long after a sailor's state changes

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
  name?: string;
  carry?: "crate" | "barrels" | null;
  cart?: boolean;
  leaving?: boolean;
  wait?: number;
  coat?: string;
  changedAt?: number;
}

const sameSpot = (a?: Spot, b?: Spot) => JSON.stringify(a) === JSON.stringify(b);

// Sydney time of day for the sky: same answer on the server and in the browser.
function phaseAt(now: number): "night" | "dawn" | "day" | "dusk" {
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: PORT_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
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
  const lifting = carry === "crate" && !cart;
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
      <rect x={3.4} y={lifting ? -18 : -11} width={1.6} height={lifting ? 7 : 5} fill={coat} />
      <rect x={-3} y={-17} width={6} height={5} fill={skin} />
      <rect x={1} y={-15.4} width={1} height={1} fill={dark} />
      {folk === "dockhand" && <rect x={-3.2} y={-17.6} width={6.4} height={1.6} fill="#b8322f" />}
      {folk === "master" && <g><rect x={-3.6} y={-19} width={7.2} height={2.2} fill="#1d2d44" /><rect x={-1} y={-18.6} width={2} height={1} fill="#d9b35f" /></g>}
      {folk === "townsfolk" && <rect x={-3} y={-18} width={6} height={1.4} fill="#5b4636" />}
      {lifting && <rect x={-5} y={-25} width={10} height={7} fill="#a0703f" stroke="#5a3b2a" strokeWidth={0.6} />}
    </g>
  );
}

// BXD-97: each ship's colours and flag, from the style seed in the feed.
const HULLS = ["#6e4530", "#2b2b2e", "#7a2626", "#23395b", "#2f5a3a", "#8a6a2b", "#4d3a4f", "#1f5f63"];
const BANDS = ["#d9b35f", "#c9c2b8", "#b8322f", "#efe7d6"];
const SAILS = ["#e9dcb8", "#efe7d6", "#d9cfb4", "#e9dcb8", "#3a3a3f"];
function shipLook(ship: PortShip) {
  const s = ship.style;
  if (ship.kind === "voyage") return { hull: "#4d3a4f", band: "#c9c2b8", sail: "#cfc6d8", flag: -1, field: "#161616" };
  return { hull: HULLS[s % HULLS.length], band: BANDS[(s >> 3) % BANDS.length], sail: SAILS[(s >> 5) % SAILS.length], flag: (s >> 8) % 8, field: (s >> 11) % 5 === 0 ? "#7a1c1c" : "#161616" };
}

// A Jolly Roger on a 40 × 26 field (flag-local units); design -1 is a plain black flag.
function JollyRoger({ design, field }: { design: number; field: string }) {
  const W = "#efe7d6";
  const skull = (cx: number, cy: number, r = 1) => (
    <g>
      <rect x={cx - 5 * r} y={cy - 5 * r} width={10 * r} height={7 * r} fill={W} />
      <rect x={cx - 3 * r} y={cy + 2 * r} width={6 * r} height={3 * r} fill={W} />
      <rect x={cx - 3 * r} y={cy - 3 * r} width={2 * r} height={2 * r} fill={field} />
      <rect x={cx + 1 * r} y={cy - 3 * r} width={2 * r} height={2 * r} fill={field} />
      <rect x={cx - 0.5 * r} y={cy + 3 * r} width={1 * r} height={2 * r} fill={field} />
    </g>
  );
  const bones = (cx: number, cy: number) => (
    <g fill={W}>
      <rect x={cx - 11} y={cy - 1.2} width={22} height={2.4} transform={`rotate(28 ${cx} ${cy})`} />
      <rect x={cx - 11} y={cy - 1.2} width={22} height={2.4} transform={`rotate(-28 ${cx} ${cy})`} />
    </g>
  );
  const blade = (cx: number, cy: number, angle: number) => (
    <g transform={`rotate(${angle} ${cx} ${cy})`}>
      <rect x={cx - 1} y={cy - 11} width={2} height={16} fill={W} />
      <rect x={cx - 3.5} y={cy + 4} width={7} height={1.6} fill="#d9b35f" />
      <rect x={cx - 0.8} y={cy + 5.6} width={1.6} height={4} fill="#d9b35f" />
    </g>
  );
  let emblem: React.ReactNode = null;
  switch (design) {
    case 0: emblem = <>{bones(20, 16)}{skull(20, 11)}</>; break;
    case 1: emblem = <>{blade(20, 13, 35)}{blade(20, 13, -35)}</>; break;
    case 2: emblem = <path d="M13 4 L27 4 L20 13 L27 22 L13 22 L20 13 Z" fill={W} />; break;
    case 3: emblem = <><path d="M12 9 Q12 4 16 4 Q19 4 20 8 Q21 4 24 4 Q28 4 28 9 Q28 14 20 21 Q12 14 12 9 Z" fill="#c23b3b" />{blade(31, 13, 20)}</>; break;
    case 4: emblem = <>{blade(20, 14, 55)}{blade(20, 14, -55)}{skull(20, 11, 0.9)}</>; break;
    case 5: emblem = bones(20, 13); break;
    case 6: emblem = <g fill={W}><rect x={19} y={4} width={2} height={16} /><rect x={15} y={7} width={10} height={2} /><path d="M12 15 Q20 25 28 15 L26 15 Q20 21 14 15 Z" /><rect x={18} y={2} width={4} height={3} /></g>; break;
    case 7: emblem = <>{skull(15, 12, 0.9)}<rect x={27} y={3} width={2} height={20} fill={W} /><path d="M25 3 L28 -2 L31 3 Z" fill={W} /></>; break;
  }
  return <g><rect x={0} y={0} width={40} height={26} fill={field} />{emblem}</g>;
}

const boardKeys = (onBoard: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  onClick: onBoard,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBoard(); } },
});

// A ship at the quay: sails set, gangplank down.
function QuayShip({ berth, ship, alarm, pennant, onBoard }: {
  berth: Berth; ship: PortShip; alarm: boolean; pennant: boolean; onBoard: () => void;
}) {
  const { cx, scale: s } = berth;
  const look = shipLook(ship);
  return (
    <g className="port-ship" {...boardKeys(onBoard)} aria-label={`Board ${ship.name}${alarm ? ", someone needs you" : ""}`}>
      <title>{ship.name}</title>
      <g className="port-bob" style={{ animationDelay: `${(cx % 7) * 0.4}s` }}>
        <g transform={`translate(${cx} ${WATERLINE}) scale(${s})`}>
          <g stroke="#caa877" strokeWidth={1.4 / s} opacity={0.75}>
            <line x1={0} y1={-262} x2={-100} y2={-50} />
            <line x1={0} y1={-262} x2={100} y2={-50} />
          </g>
          <rect x={-4} y={-270} width={8} height={224} fill="#5a3b2a" />
          <rect x={-66} y={-238} width={132} height={5} fill="#6a4630" />
          <rect x={-54} y={-160} width={108} height={5} fill="#6a4630" />
          <path d="M-62 -233 L62 -233 L56 -166 L-56 -166 Z" fill={look.sail} className="crew-sail" />
          <path d="M-50 -155 L50 -155 L44 -108 L-44 -108 Z" fill={look.sail} opacity={0.92} />
          {/* CSS animations replace an SVG transform, so the flutter lives on an inner group */}
          <g transform="translate(4 -270)"><g className="crew-flag"><JollyRoger design={look.flag} field={look.field} /></g></g>
          {alarm && (
            <g transform="translate(-4 -268)"><g className="port-alarm-flag">
              <path d="M0 0 L-34 8 L0 16 Z" fill="#d23b3b" />
              <text x={-12} y={12} className="port-alarm">!</text>
            </g></g>
          )}
          {pennant && <path d="M-4 -120 L-34 -114 L-4 -108 Z" fill="#f4cf83" className="port-pennant" />}
          <path d="M-105 -46 L105 -46 L90 -6 Q0 6 -90 -6 Z" fill={look.hull} />
          <rect x={-107} y={-50} width={214} height={6} fill="#b98050" />
          <rect x={-100} y={-30} width={196} height={5} fill={look.band} opacity={0.85} />
          {[-60, -20, 20, 60].map((x) => <circle key={x} cx={x} cy={-16} r={4} fill="#15384a" stroke="#d9b35f" strokeWidth={1.5} />)}
          <rect x={22} y={-50} width={20} height={4} fill="#3b2419" />
        </g>
      </g>
      <line x1={berth.plankTop.x} y1={berth.plankTop.y} x2={berth.plankFoot.x} y2={QUAY_Y - 1} stroke="#8a5a36" strokeWidth={5} strokeLinecap="round" />
    </g>
  );
}

// A quiet ship at its mooring in the bay: sails furled, name on the water beside it.
function MooredShip({ berth, ship, onBoard }: { berth: Berth; ship: PortShip; onBoard: () => void }) {
  const { cx, scale: s, waterline } = berth;
  const look = shipLook(ship);
  // Fit the name to the gap between neighbours (7.2 units a character at 11px monospace).
  const fit = Math.max(4, Math.floor((berth.room - 12) / 7.2));
  const label = ship.name.length > fit ? `${ship.name.slice(0, fit - 1)}…` : ship.name;
  return (
    <g className="port-ship" {...boardKeys(onBoard)} aria-label={`Board ${ship.name}, at its mooring`}>
      <title>{`${ship.name} · at its mooring (quiet for 3 hours or more)`}</title>
      <g className="port-bob" style={{ animationDelay: `${(cx % 11) * 0.3}s`, animationDuration: "5.5s" }}>
        <g transform={`translate(${cx} ${waterline}) scale(${s})`}>
          <rect x={-4} y={-250} width={8} height={204} fill="#4e3322" />
          <rect x={-60} y={-214} width={120} height={6} fill="#5f3f2b" />
          <rect x={-56} y={-222} width={112} height={9} rx={4} fill="#d8cba8" />
          <rect x={-48} y={-146} width={96} height={6} fill="#5f3f2b" />
          <rect x={-44} y={-154} width={88} height={9} rx={4} fill="#cfc19c" />
          <g transform="translate(4 -252)"><JollyRoger design={look.flag} field={look.field} /></g>
          <path d="M-105 -46 L105 -46 L90 -6 Q0 6 -90 -6 Z" fill={look.hull} />
          <rect x={-100} y={-30} width={196} height={6} fill={look.band} opacity={0.85} />
          <rect x={-107} y={-50} width={214} height={6} fill="#b98050" />
          <line x1={0} y1={-6} x2={-150} y2={20} stroke="#caa877" strokeWidth={3} opacity={0.6} />
        </g>
      </g>
      <g transform={`translate(${cx} ${waterline + 13})`}>
        <rect x={-label.length * 3.6 - 6} y={-10} width={label.length * 7.2 + 12} height={15} rx={3} className="port-mooring-plate" />
        <text x={0} y={1} textAnchor="middle" className="port-mooring-name">{label}</text>
      </g>
    </g>
  );
}

// The berth's sign on the quay face: drawn after the quay so the planks don't cover it.
function BerthSign({ berth, ship, onBoard }: { berth: Berth; ship: PortShip; onBoard: () => void }) {
  const label = ship.name.length > 22 ? `${ship.name.slice(0, 21)}…` : ship.name;
  return (
    <g transform={`translate(${berth.cx} ${QUAY_Y + 10})`} className="port-ship" onClick={onBoard} aria-hidden="true">
      <rect x={-88} y={0} width={176} height={36} rx={4} className="port-sign" />
      <text x={0} y={15} textAnchor="middle" className="port-sign-name">{label}</text>
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
          <stop offset="1" stopColor={night ? "#081c2a" : "#174558"} />
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
      {[0, 1, 2].map((i) => (
        <g key={i} className="port-gull" style={{ animationDelay: `${i * -7}s`, animationDuration: `${22 + i * 6}s` }}>
          <path d={`M0 ${120 + i * 40} q6 -6 12 0 q6 -6 12 0`} fill="none" stroke={night ? "#9fb3c4" : "#f4f1ea"} strokeWidth={2.2} className="port-wing" />
        </g>
      ))}
      <path d="M0 330 Q200 300 420 320 T900 318 T1300 322 T1600 316 L1600 334 L0 334 Z" fill={night ? "#10243a" : "#5b7f8f"} opacity={0.8} />
      <g transform="translate(1580 330)">
        <path d="M-34 4 Q0 -20 34 4 Z" fill={night ? "#1c2a36" : "#6d6258"} />
        <path d="M-8 -6 L8 -6 L6 -62 L-6 -62 Z" fill="#efe7d6" />
        <rect x={-6} y={-40} width={12} height={8} fill="#b8322f" />
        <rect x={-6} y={-20} width={12} height={8} fill="#b8322f" />
        <rect x={-5} y={-72} width={10} height={10} fill={lit ? "#ffe39a" : "#cfd8dc"} />
        {lit && <path d="M0 -67 L-190 -92 L-190 -42 Z" fill="#ffe39a" opacity={0.22} className="port-beam" />}
      </g>
      <rect x={0} y={330} width={PORT_W} height={PORT_H - 330} fill="url(#port-sea)" />
      <g className="crew-sea" opacity={0.45}>
        {[380, 600, 700].map((y) => (
          <path key={y} d={`M-100 ${y} ${"q25 -8 50 0 t50 0 ".repeat(36)}`} fill="none" stroke="#8fc3d4" strokeWidth={1.5} />
        ))}
      </g>
    </g>
  );
}

// A painted board sized to its lines (monospace: ~0.62 em a character), with the text held
// inside it by textLength, so a name can never run off the edge.
function Sign({ x, y, lines, size, board = "#e9dcb8", ink = "#3e2419", maxWidth }: {
  x: number; y: number; lines: string[]; size: number; board?: string; ink?: string; maxWidth: number;
}) {
  const charW = size * 0.62;
  const inner = Math.min(maxWidth - 8, Math.max(...lines.map((l) => l.length)) * charW);
  const w = inner + 8;
  const h = lines.length * (size + 2) + 5;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={board} stroke={ink} strokeWidth={1.5} />
      {lines.map((line, i) => {
        const len = Math.min(inner, line.length * charW);
        return (
          <text key={line} x={0} y={-h / 2 + 3 + (i + 1) * (size + 2) - 2} textAnchor="middle" fill={ink}
            style={{ font: `700 ${size}px monospace` }} textLength={len} lengthAdjust="spacingAndGlyphs">{line}</text>
        );
      })}
    </g>
  );
}

function Town({ phase, bell, glint }: { phase: ReturnType<typeof phaseAt>; bell: boolean; glint: boolean }) {
  const lit = phase === "night" || phase === "dusk";
  const win = lit ? "#ffd27a" : "#2d3e4c";
  return (
    <g aria-hidden="true">
      {[[20, 300, 70, "#8c5b4a"], [96, 310, 60, "#6f7f8c"]].map(([x, y, w, c]) => (
        <g key={`${x}`}>
          <rect x={x as number} y={y as number} width={w as number} height={470 - (y as number)} fill={c as string} />
          <path d={`M${(x as number) - 6} ${y} L${(x as number) + (w as number) / 2} ${(y as number) - 26} L${(x as number) + (w as number) + 6} ${y} Z`} fill="#5a3b2a" />
          <rect x={(x as number) + 12} y={(y as number) + 16} width={10} height={12} fill={win} />
          <rect x={(x as number) + (w as number) - 24} y={(y as number) + 16} width={10} height={12} fill={win} />
        </g>
      ))}
      <rect x={40} y={352} width={170} height={118} fill="#7a4b2c" />
      <path d="M32 352 L125 312 L218 352 Z" fill="#4e3020" />
      <rect x={104} y={402} width={48} height={68} fill="#3b2419" />
      <Sign x={125} y={381} lines={["WHOREHOUSE"]} size={11} board="#4e3020" ink="#f1dfb6" maxWidth={150} />
      {/* a red lantern by the door */}
      <rect x={157} y={404} width={2} height={8} fill="#2a1f1c" />
      <rect x={154} y={412} width={8} height={10} rx={2} fill="#d23b3b" className="crew-lantern" />
      <g className="port-smoke"><circle cx={70} cy={318} r={6} /><circle cx={76} cy={300} r={8} /><circle cx={70} cy={280} r={10} /></g>
      <rect x={62} y={318} width={14} height={24} fill="#4e3020" />
      <rect x={228} y={380} width={78} height={90} fill="#d9c9a3" />
      <path d="M222 380 L267 350 L312 380 Z" fill="#8a3b33" />
      <rect x={252} y={420} width={22} height={50} fill="#5a3b2a" />
      <rect x={236} y={394} width={12} height={12} fill={win} />
      <rect x={286} y={394} width={12} height={12} fill={win} />
      <Sign x={263} y={412} lines={["SHIPWRIGHT"]} size={8} maxWidth={74} />
      <g transform="translate(267 350)">
        <rect x={-10} y={-28} width={20} height={4} fill="#5a3b2a" />
        <rect x={-9} y={-24} width={2} height={20} fill="#5a3b2a" /><rect x={7} y={-24} width={2} height={20} fill="#5a3b2a" />
        <g className={bell ? "port-bell port-bell-ring" : "port-bell"}><path d="M-5 -22 Q0 -26 5 -22 L6 -12 L-6 -12 Z" fill="#d9b35f" /></g>
      </g>
      {bell && <text x={292} y={322} className="port-ding">ding!</text>}
      {/* BXD-97: the tavern. Ready crew drink outside; finished crew go in. */}
      <g>
        <rect x={314} y={356} width={108} height={114} fill="#6b3f2a" />
        <rect x={314} y={356} width={108} height={8} fill="#4e2c1d" />
        <path d="M306 358 L368 318 L430 358 Z" fill="#3e2419" />
        <rect x={334} y={330} width={8} height={18} fill="#3e2419" />
        <g className="port-smoke"><circle cx={338} cy={324} r={5} /><circle cx={344} cy={308} r={7} /><circle cx={338} cy={290} r={9} /></g>
        {[326, 396].map((x) => <g key={x}><rect x={x} y={376} width={14} height={14} fill={win} /><rect x={x + 6} y={376} width={2} height={14} fill="#4e2c1d" /></g>)}
        <rect x={326} y={416} width={14} height={12} fill={win} /><rect x={396} y={416} width={14} height={12} fill={win} />
        <rect x={TAVERN_DOOR.x - 10} y={420} width={20} height={50} fill="#2e1a12" />
        <rect x={TAVERN_DOOR.x - 10} y={420} width={20} height={4} fill="#d9b35f" opacity={0.5} />
        <Sign x={368} y={397} lines={["THE PLASTERED", "BASTARD"]} size={9} maxWidth={96} />
        <rect x={306} y={458} width={124} height={4} fill="#5a3b2a" />
        {[310, 426].map((x) => <rect key={x} x={x} y={458} width={3} height={12} fill="#5a3b2a" />)}
      </g>
      {/* the town's ground runs down to the bay; the quay reaches out over the water */}
      <path d={`M0 470 L440 470 L440 540 Q380 600 300 ${PORT_H} L0 ${PORT_H} Z`} fill="#6b6259" />
      <rect x={420} y={470} width={PORT_W - 420} height={24} fill="#9a6a42" />
      <g stroke="#6e4a2e" strokeWidth={1}>{Array.from({ length: 30 }, (_, i) => <line key={i} x1={440 + i * 40} y1={470} x2={440 + i * 40} y2={494} />)}</g>
      {Array.from({ length: 15 }, (_, i) => <rect key={i} x={452 + i * 80} y={494} width={10} height={70} fill="#4a3322" />)}
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={500 + i * 112} y={460} width={9} height={10} rx={2} fill="#2f2f2f" />)}
      <g transform={`translate(${TIDE_GAUGE.x + 14} 470)`}>
        <rect x={-3} y={-40} width={6} height={100} fill="#efe7d6" />
        {[-34, -22, -10, 2, 14, 26, 38].map((y) => <rect key={y} x={-3} y={y} width={6} height={5} fill="#b8322f" />)}
        {glint && <circle cx={0} cy={-44} r={5} className="port-glint" />}
      </g>
      {/* stairs down to the rowing boat */}
      <g fill="#6e4a2e">{Array.from({ length: 10 }, (_, i) => <rect key={i} x={DINGHY.stairsX - 8 + i * 7} y={494 + i * 11} width={20} height={5} />)}</g>
    </g>
  );
}

// The rowing boat, in two layers so its crew sit inside it: the back (oars) and the hull.
function DinghyBack({ rowing }: { rowing: boolean }) {
  return (
    <g aria-hidden="true" stroke="#caa877" strokeWidth={3} strokeLinecap="round" className={rowing ? "port-oars" : undefined}>
      <line x1={DINGHY.x - 44} y1={DINGHY.y - 4} x2={DINGHY.x - 82} y2={DINGHY.y + 16} />
      <line x1={DINGHY.x + 44} y1={DINGHY.y - 4} x2={DINGHY.x + 82} y2={DINGHY.y + 16} />
    </g>
  );
}
function DinghyHull({ onBoard }: { onBoard: () => void }) {
  return (
    <g className="port-ship" {...boardKeys(onBoard)} aria-label="Board the rowing boat: sessions with no project">
      <title>Rowing boat: sessions with no project</title>
      <path d={`M${DINGHY.x - 60} ${DINGHY.y - 6} L${DINGHY.x + 60} ${DINGHY.y - 6} L${DINGHY.x + 48} ${DINGHY.y + 14} Q${DINGHY.x} ${DINGHY.y + 20} ${DINGHY.x - 48} ${DINGHY.y + 14} Z`} fill="#7a4b2c" />
      <rect x={DINGHY.x - 62} y={DINGHY.y - 10} width={124} height={5} fill="#b98050" />
    </g>
  );
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

function berthsOf(feed: PortFeed) {
  const ships = feed.ships.filter((s) => s.kind !== "dinghy");
  return layoutBerths(ships.filter((s) => s.active).map((s) => s.key), ships.filter((s) => !s.active).map((s) => s.key));
}

// Everyone already at their place on the first render, server and client alike: no parade.
function initialWorld(feed: PortFeed, berths: Berth[]) {
  const sprites = new Map<string, Sprite>();
  const targets = assignSpots(feed.sailors, berths, DINGHY_KEY);
  for (const s of feed.sailors) {
    const t = targets.get(s.id);
    if (!t) continue;
    sprites.set(s.id, { id: s.id, folk: "sailor", ...pointOf(t.spot, berths), facing: 1, path: [], pose: t.pose, spot: t.spot, sailor: s, name: s.name });
  }
  const coats = ["#7d8a8f", "#9b7a5a", "#6f7d5a", "#8a6f86"];
  [60, 190, 318, 395].forEach((x, i) => sprites.set(`town-${i}`, { id: `town-${i}`, folk: "townsfolk", x, y: QUAY_Y, s: 0.95, facing: i % 2 ? -1 : 1, path: [], pose: "rest", wait: 1 + i * 1.7, coat: coats[i] }));
  sprites.set("master", { id: "master", folk: "master", ...OFFICE_DOOR, s: 1, facing: 1, path: [], pose: "rest", coat: "#26456e", name: "Shipwright" });
  // Errands older than the replay window are treated as already run.
  const seen = new Set(feed.happenings.filter((h) => feed.now - Date.parse(h.at) > REPLAY_MS).map((h) => h.id));
  return { sprites, seen, queue: [] as Happening[] };
}

export function PortScene({ feed, focus, onBoard }: { feed: PortFeed; focus: string | null; onBoard: (key: string) => void }) {
  const reduced = useReducedMotion();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const phase = phaseAt(feed.now);
  const berths = useMemo(() => berthsOf(feed), [feed]);
  const berthsRef = useRef(berths);
  const [world] = useState(() => initialWorld(feed, berths));
  const els = useRef(new Map<string, SVGGElement>());
  const plates = useRef(new Map<string, SVGGElement>());
  const svg = useRef<SVGSVGElement>(null);
  const camera = useRef<Camera>(HARBOUR_CAMERA);
  const [bellUntil, setBellUntil] = useState(0);
  const [glintUntil, setGlintUntil] = useState(0);
  const [pennants, setPennants] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(feed.now);
  const frame = useRef<HTMLDivElement>(null);

  const place = (sp: Sprite) => {
    const t = `translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})`;
    const el = els.current.get(sp.id);
    if (el) {
      el.setAttribute("transform", t);
      (el.firstElementChild as SVGGElement | null)?.setAttribute("transform", `scale(${(U * sp.s * sp.facing).toFixed(3)} ${(U * sp.s).toFixed(3)})`);
    }
    plates.current.get(sp.id)?.setAttribute("transform", t);
  };

  // Boarding: glide the camera to the ship (or back out to the harbour).
  useEffect(() => {
    const target = cameraFor(focus, berths, DINGHY_KEY);
    const el = svg.current;
    if (!el) return;
    const from = camera.current;
    const set = (c: Camera) => { camera.current = c; el.setAttribute("viewBox", `${c.x.toFixed(1)} ${c.y.toFixed(1)} ${c.w.toFixed(1)} ${c.h.toFixed(1)}`); };
    if (reduced) { set(target); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      set({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus, berths, reduced]);

  // Each refresh: walk sailors to their new places, send the departed into town, queue errands.
  useEffect(() => {
    berthsRef.current = berths;
    const map = world.sprites;
    const targets = assignSpots(feed.sailors, berths, DINGHY_KEY);
    const present = new Set<string>();
    const now = Date.now();
    for (const s of feed.sailors) {
      const t = targets.get(s.id);
      if (!t) continue;
      present.add(s.id);
      let sp = map.get(s.id);
      if (!sp) {
        const start = reduced ? pointOf(t.spot, berths) : pointOf({ zone: "town" }, berths);
        sp = { id: s.id, folk: "sailor", ...start, facing: 1, path: [], pose: t.pose, spot: reduced ? t.spot : { zone: "town" }, sailor: s, name: s.name, changedAt: now };
        map.set(s.id, sp);
      }
      if (sp.sailor && sp.sailor.state !== s.state) { sp.changedAt = now; sp.carry = null; }
      sp.sailor = s;
      sp.name = s.name;
      sp.pose = t.pose;
      sp.leaving = false;
      if (!sameSpot(sp.spot, t.spot)) {
        if (reduced) Object.assign(sp, pointOf(t.spot, berths), { path: [] });
        else sp.path = planWalk(sp.spot ?? { zone: "town" }, t.spot, berths);
        sp.spot = t.spot;
      } else if (sp.spot?.zone === "deck" && !sp.path.length) {
        Object.assign(sp, pointOf(sp.spot, berths)); // the ship itself may have moved berth
      }
    }
    for (const sp of map.values()) {
      if (sp.folk !== "sailor" || present.has(sp.id) || sp.leaving) continue;
      if (reduced) { map.delete(sp.id); continue; }
      sp.leaving = true;
      sp.changedAt = now;
      const id = sp.id;
      const route: Step[] = planWalk(sp.spot ?? { zone: "town" }, { zone: "tavern", x: TAVERN_DOOR.x }, berths);
      route[route.length - 1] = { ...route[route.length - 1], then: () => { map.delete(id); bump(); } };
      sp.path = route;
      sp.carry = null;
      sp.spot = { zone: "tavern", x: TAVERN_DOOR.x };
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
    const timer = window.setInterval(() => {
      setClock(Date.now());
      if (reduced) { world.queue.splice(0); return; }
      const map = world.sprites;
      const busy = [...map.values()].filter((sp) => sp.folk === "dockhand").length;
      const h = world.queue[0];
      if (!h) return;
      const route = (kind: "cargo" | "delivery" | "cart" | "tide") => errandRoute(kind, berthsRef.current, h.ship);
      if (h.kind === "bell") { world.queue.shift(); setBellUntil(Date.now() + 3000); return; }
      if (h.kind === "tide") {
        const master = map.get("master")!;
        if (master.path.length) return;
        world.queue.shift();
        const r: Step[] = route("tide").route;
        r[1] = { ...r[1], then: () => setGlintUntil(Date.now() + 2500) };
        master.path = r.slice(1);
        bump();
        return;
      }
      if (busy >= MAX_ERRANDS) return;
      world.queue.shift();
      const id = `hand-${h.id}`;
      const { route: legs, handover } = route(h.kind === "cart" ? "cart" : h.kind === "delivery" ? "delivery" : "cargo");
      const r: Step[] = legs;
      const hand: Sprite = { id, folk: "dockhand", ...r[0], facing: 1, path: [], pose: "rest", coat: "#8f6b43", carry: h.kind === "cargo" ? "crate" : null, cart: h.kind === "cart", name: h.who };
      r[handover] = { ...r[handover], then: () => {
        if (h.kind === "cargo") hand.carry = null; // down the hatch
        if (h.kind === "delivery") hand.carry = "crate"; // up from below, off to the whorehouse
        if (h.kind === "cart") hand.carry = "barrels";
        bump();
      } };
      r[r.length - 1] = { ...r[r.length - 1], then: () => { map.delete(id); bump(); } };
      const ship = h.ship;
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
        if (!sp.path.length && sp.folk === "sailor" && sp.sailor?.state === "working" && sp.spot?.zone === "deck" && !sp.leaving) {
          sp.wait = (sp.wait ?? 2 + rand() * 6) - dt;
          if (sp.wait <= 0) {
            const b = berthsRef.current.find((x) => x.key === (sp.spot as { ship: string }).ship);
            if (b && !b.moored) {
              const home = pointOf(sp.spot, berthsRef.current);
              sp.path = [{ ...b.hatch, s: b.scale, then: () => { sp.carry = sp.carry ? null : "crate"; } }, { ...home, then: () => { sp.carry = null; } }];
              if (rand() < 0.5) sp.carry = "crate"; // taking one down, or bringing one up
            }
            sp.wait = 4 + rand() * 8;
            changed = true;
          }
        }
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

  // On a narrow screen the port pans; start with the first ship that needs you (or the quay) in view.
  useEffect(() => {
    const el = frame.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const want = feed.sailors.find((s) => s.state === "needs_approval")?.ship;
    const berth = berths.find((b) => b.key === want && !b.moored) ?? berths.find((b) => !b.moored);
    el.scrollLeft = ((berth ? berth.cx : 700) / PORT_W) * el.scrollWidth - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shipsByKey = new Map(feed.ships.map((s) => [s.key, s]));
  const all = [...world.sprites.values()].sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
  const onDeck = all.filter((sp) => sp.folk === "sailor" && sp.spot?.zone === "deck" && !sp.path.length);
  const rest = all.filter((sp) => !onDeck.includes(sp));
  const quay = berths.filter((b) => !b.moored);
  const moored = berths.filter((b) => b.moored);
  const hasDinghy = feed.ships.some((s) => s.kind === "dinghy");

  // Names show when someone is doing something, and always up close.
  const showName = (sp: Sprite) => {
    if (!sp.name || sp.folk === "townsfolk") return false;
    if (sp.folk === "dockhand") return true;
    if (focus && sp.sailor?.ship === focus) return true; // up close: the boarded ship's whole crew
    if (sp.folk === "master") return sp.path.length > 0;
    return sp.path.length > 0 || sp.sailor?.state === "needs_approval" || clock - (sp.changedAt ?? 0) < FRESH_MS;
  };

  const figure = (sp: Sprite) => {
    const walking = sp.path.length > 0;
    const pose: Pose = walking ? "walk" : sp.pose;
    const m = sp.sailor;
    const body = m
      ? <Sailor pose={pose} coat={coatFor(m.provider)} sub={m.sub} look={lookFor(m.name, m.sub)} carry={sp.carry === "crate"} />
      : <Person folk={sp.folk} coat={sp.coat ?? "#777"} pose={pose} carry={sp.carry} cart={sp.cart} />;
    const tip = m ? `${m.name} (${m.provider}) · ${labels[m.state]} · ${shipsByKey.get(m.ship)?.name ?? ""}${m.detail ? ` · ${m.detail}` : ""}`
      : sp.folk === "dockhand" ? `${sp.name ?? "A dockhand"} on a real errand` : sp.folk === "master" ? "The shipwright (reads the tide gauge every 5 minutes)" : "Townsfolk (scenery)";
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
        {m && pose === "doze" && <text x={8} y={-40 * sp.s} className="crew-zzz">z<tspan dx={2} dy={-5}>z</tspan></text>}
      </g>
    );
    return m?.href ? <a key={sp.id} href={m.href} aria-label={`${m.name}: ${labels[m.state]}`}>{inner}</a> : <g key={sp.id}>{inner}</g>;
  };

  // Nameplates for close neighbours stack instead of overlapping (worked out per render).
  const named = all.filter(showName);
  const lift = new Map<string, number>();
  const placed: { x: number; y: number; w: number }[] = [];
  for (const sp of [...named].sort((a, b) => a.x - b.x)) {
    const w = sp.name!.length * 6.4 + 10;
    const baseY = sp.y - (!sp.path.length && (sp.pose === "doze" || sp.pose === "drink") ? 40 : 56) * sp.s;
    let tier = 0;
    while (placed.some((p) => Math.abs(p.x - sp.x) < (p.w + w) / 2 + 2 && Math.abs(p.y - (baseY - tier * 16)) < 15) && tier < 4) tier++;
    lift.set(sp.id, tier * 16);
    placed.push({ x: sp.x, y: baseY - tier * 16, w });
  }
  const plate = (sp: Sprite) => {
    const text = sp.name!;
    const w = text.length * 6.4 + 10;
    const seated = !sp.path.length && (sp.pose === "doze" || sp.pose === "drink");
    const up = (seated ? 40 : 56) * sp.s + (sp.carry === "crate" && !sp.cart ? 16 : 0) + (lift.get(sp.id) ?? 0);
    return (
      <g key={`plate-${sp.id}`} ref={(el) => { if (el) { plates.current.set(sp.id, el); place(sp); } else plates.current.delete(sp.id); }} transform={`translate(${sp.x} ${sp.y})`} aria-hidden="true">
        <g transform={`translate(0 ${-up})`}>
          <rect x={-w / 2} y={-11} width={w} height={14} rx={3} className={sp.folk === "sailor" ? "port-plate" : "port-plate port-plate-hand"} />
          <text x={0} y={0} textAnchor="middle" className="port-plate-text">{text}</text>
        </g>
      </g>
    );
  };

  return (
    <div className="port-frame" ref={frame}>
      <svg ref={svg} className="port-svg" viewBox={`0 0 ${PORT_W} ${PORT_H}`} role="img"
        aria-label="The port: every project is a ship; each live agent session is a named sailor on or beside its ship">
        <Scenery phase={phase} />
        {quay.map((b) => {
          const ship = shipsByKey.get(b.key)!;
          return <QuayShip key={b.key} berth={b} ship={ship} pennant={(pennants[b.key] ?? 0) > clock}
            alarm={feed.sailors.some((s) => s.ship === b.key && s.state === "needs_approval")} onBoard={() => onBoard(b.key)} />;
        })}
        <g>{onDeck.map(figure)}</g>
        <Town phase={phase} bell={bellUntil > clock} glint={glintUntil > clock} />
        {quay.map((b) => <BerthSign key={b.key} berth={b} ship={shipsByKey.get(b.key)!} onBoard={() => onBoard(b.key)} />)}
        {moored.map((b) => <MooredShip key={b.key} berth={b} ship={shipsByKey.get(b.key)!} onBoard={() => onBoard(b.key)} />)}
        {hasDinghy && <DinghyBack rowing={feed.sailors.some((s) => s.ship === DINGHY_KEY && s.state !== "stale")} />}
        <g>{rest.map(figure)}</g>
        {hasDinghy && <DinghyHull onBoard={() => onBoard(DINGHY_KEY)} />}
        <g>{named.map(plate)}</g>
        {feed.ships.length === 0 && (
          <g transform="translate(900 250)">
            <rect x={-200} y={-26} width={400} height={44} rx={8} fill="#f1e2bc" stroke="#6a4630" strokeWidth={3} />
            <text x={0} y={2} textAnchor="middle" className="crew-empty-text">The harbour is closed to visitors</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// Boarded: who's aboard, the ship's numbers and its latest log lines.
function ShipCard({ feed, ship, onLeave }: { feed: PortFeed; ship: PortShip; onLeave: () => void }) {
  const crew = feed.sailors.filter((s) => s.ship === ship.key);
  const lines = feed.entries.filter((e) => e.ship === ship.key).slice(-6);
  return (
    <div className="port-card">
      <div className="port-card-head">
        <div>
          <strong className="port-card-name">{ship.href ? <a href={ship.href}>{ship.name}</a> : ship.name}</strong>
          <span className="port-card-meta">
            {ship.kind === "dinghy" ? "sessions with no project" : ship.active ? "at the quay" : "at its mooring, quiet for 3 hours or more"}
            {ship.todo !== null && ` · ${ship.inProgress} underway · ${ship.todo} to do`}
          </span>
        </div>
        <button type="button" className="port-card-back" onClick={onLeave}>Back to the harbour</button>
      </div>
      <div className="port-card-grid">
        <div>
          <h3>Aboard</h3>
          {crew.length ? (
            <ul>{crew.map((s) => (
              <li key={s.id}>
                <span className="port-dot" style={{ background: coatFor(s.provider) }} />
                {s.href ? <a href={s.href}>{s.name}</a> : s.name} <span className="port-muted">({s.provider}{s.sub ? ", cabin hand" : ""})</span>
                <span className={s.state === "needs_approval" ? "port-needs" : "port-muted"}> · {labels[s.state]} since {clockText(s.since)}</span>
                {s.detail && <span className="port-muted"> · {s.detail}</span>}
              </li>
            ))}</ul>
          ) : <p className="port-muted">No one aboard right now.</p>}
        </div>
        <div>
          <h3>Latest</h3>
          {lines.length ? (
            <ul>{lines.map((e) => (
              <li key={e.id}><span className="port-muted">{clockText(e.at)}</span> {e.who && <b>{e.who} </b>}{entryText(e, feed.ships)}</li>
            ))}</ul>
          ) : <p className="port-muted">Nothing logged in the last 24 hours.</p>}
        </div>
      </div>
    </div>
  );
}

// The page-level wrapper: harbour or a boarded ship, the legend, a readable ship list
// (the scene's text is small on a phone), and the screen-reader roster.
export function PortView({ feed }: { feed: PortFeed }) {
  const [focus, setFocus] = useState<string | null>(null);
  const ship = focus ? feed.ships.find((s) => s.key === focus) : undefined;
  const current = ship ? ship.key : null;
  const crewOf = (key: string) => feed.sailors.filter((s) => s.ship === key);
  const active = feed.ships.filter((s) => s.active);
  const quiet = feed.ships.filter((s) => !s.active);
  return (
    <section className="crew-scene" aria-label="Bosun port activity">
      <div className="crew-harbour">
        <span className="crew-harbour-title">{ship ? `ABOARD · ${ship.name.toUpperCase()}` : "THE PORT"}</span>
        <div className="crew-filters" aria-label="Choose a ship">
          <button type="button" aria-pressed={current === null} onClick={() => setFocus(null)}>Harbour <small>{feed.sailors.length}</small></button>
          {active.map((s) => (
            <button type="button" key={s.key} aria-pressed={current === s.key} onClick={() => setFocus(s.key)}>{s.name} <small>{crewOf(s.key).length}</small></button>
          ))}
        </div>
      </div>
      <PortScene feed={feed} focus={current} onBoard={setFocus} />
      {ship ? <ShipCard feed={feed} ship={ship} onLeave={() => setFocus(null)} /> : (
        <>
          <p className="crew-key" aria-hidden="true">
            <span>on deck, hauling cargo: working</span><span>at a gun: tool running</span><span>ale at the tavern: ready for orders</span><span>waving on the quay under a red pennant: needs you</span><span>dozing: signal stale</span><span>in the bay: quiet ships</span>
          </p>
          <p className="crew-key" aria-hidden="true">
            <span>dockhands and the shipwright run real errands: commits, finished tasks, backups, the 5-minute tide reading</span><span>townsfolk, gulls and weather are scenery</span>
          </p>
          {active.length > 0 && (
            <div className="crew-orders" aria-label="Ships at the quay">
              {active.map((s) => {
                const crew = crewOf(s.key);
                const needs = crew.filter((c) => c.state === "needs_approval").length;
                return (
                  <button type="button" className="crew-order port-order" key={s.key} onClick={() => setFocus(s.key)}>
                    <strong>{s.name}</strong>
                    <span>{crew.length} aboard{needs ? <b> · {needs} need{needs === 1 ? "s" : ""} you</b> : null}{s.todo !== null ? ` · ${s.inProgress} underway · ${s.todo} to do` : ""}</span>
                  </button>
                );
              })}
            </div>
          )}
          {quiet.length > 0 && (
            <p className="port-moorings" aria-label="Ships at their moorings">
              <span>At their moorings:</span>
              {quiet.map((s) => <button type="button" key={s.key} onClick={() => setFocus(s.key)}>{s.name}</button>)}
            </p>
          )}
        </>
      )}
      <p className="crew-caption">{feed.publicView ? "Public view · names are made up, private work shows as anonymous voyages · updates every 10 seconds" : "Live session signals · positions and errands reflect observed events"}</p>
      <div className="sr-only" role="status">
        {feed.sailors.length ? feed.sailors.map((s) => `${s.name} on ${shipNameOf(feed.ships, s.ship)}: ${labels[s.state]}`).join(". ") : "No live agents right now."}
      </div>
    </section>
  );
}
