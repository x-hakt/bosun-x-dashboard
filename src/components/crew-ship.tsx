"use client";

import { useState } from "react";
import type { PublicCrew, PublicFleet } from "@/lib/activity";
import { layoutCrew, SLOTS, type Placed, type Pose } from "@/lib/crew-scene";

// IDEA-20 (BXD-81): the living deck. One SVG ship; each session is an original
// pixel-art sailor standing where its observed state puts it (see lib/crew-scene.ts).
// The sr-only roster and the lists on the page stay the accessible source of truth.

const labels: Record<PublicCrew["state"], string> = {
  working: "Working", waiting_for_tool: "Tool running", needs_approval: "Awaiting approval",
  ready_for_prompt: "Ready", finished: "Finished", stale: "Signal stale", unknown: "Unknown",
};

type DisplayCrew = PublicCrew & { href?: string; sub?: boolean };

const COAT: Record<string, string> = { Claude: "#d9773f", Codex: "#2a9d8f" };
const coatFor = (alias: string) => COAT[alias.split(" ")[0]] ?? "#8e7cc3";

// A sailor, drawn on a 1-unit grid (feet at 0,0; ~12 units wide, ~21 tall), scaled by
// `u` px per unit. Poses change arms/legs; the whole figure lies down to sleep.
function Sailor({ pose, coat, sub }: { pose: Pose; coat: string; sub?: boolean }) {
  const skin = "#e8b98a";
  const dark = "#2a1f1c";
  const arms =
    pose === "haul" || pose === "climb" ? (
      <g className="crew-arms">
        <rect x={-5} y={-17} width={1.6} height={6} fill={coat} />
        <rect x={3.4} y={-17} width={1.6} height={6} fill={coat} />
        <rect x={-5} y={-18} width={1.6} height={1.2} fill={skin} />
        <rect x={3.4} y={-18} width={1.6} height={1.2} fill={skin} />
      </g>
    ) : pose === "fire" ? (
      <g>
        <rect x={-5} y={-11} width={1.6} height={5} fill={coat} />
        <rect x={3.4} y={-11} width={4} height={1.6} fill={coat} />
        <rect x={7.2} y={-11} width={1.2} height={1.4} fill={skin} />
        <rect x={8.2} y={-12.2} width={7} height={0.8} fill="#6b4a2b" transform="rotate(18 8.2 -12)" />
      </g>
    ) : pose === "call" ? (
      <g>
        <rect x={-5} y={-11} width={1.6} height={5} fill={coat} />
        <g className="crew-wave">
          <rect x={3.4} y={-18} width={1.6} height={7} fill={coat} />
          <rect x={3.4} y={-19.2} width={1.6} height={1.3} fill={skin} />
        </g>
      </g>
    ) : (
      <g>
        <rect x={-5} y={-11} width={1.6} height={5} fill={coat} />
        <rect x={3.4} y={-11} width={1.6} height={5} fill={coat} />
      </g>
    );
  const legs =
    pose === "rest" ? (
      <g>
        <rect x={-3} y={-5} width={7} height={2} fill={dark} />
        <rect x={3} y={-5} width={2} height={5} fill={dark} />
        <rect x={3} y={-1} width={3} height={1} fill="#111" />
      </g>
    ) : (
      <g>
        <rect x={-3} y={-5} width={2.4} height={4} fill={dark} />
        <rect x={0.6} y={-5} width={2.4} height={4} fill={dark} />
        <rect x={-3.4} y={-1} width={3} height={1} fill="#111" />
        <rect x={0.4} y={-1} width={3} height={1} fill="#111" />
      </g>
    );
  const body = (
    <g className={`crew-body crew-pose-${pose}`} shapeRendering="crispEdges">
      {legs}
      <rect x={-4} y={-12} width={8} height={7} fill={coat} />
      <rect x={-4} y={-6.4} width={8} height={1.2} fill={dark} />
      <rect x={-0.6} y={-6.4} width={1.2} height={1.2} fill="#d9b35f" />
      {arms}
      <rect x={-3} y={-17} width={6} height={5} fill={skin} />
      <rect x={1} y={-15.4} width={1} height={1} fill={dark} />
      {sub ? (
        <rect x={-3.4} y={-18.4} width={6.8} height={1.8} fill="#b8322f" />
      ) : (
        <g>
          <rect x={-5.5} y={-18.4} width={11} height={1.4} fill="#161616" />
          <rect x={-3.8} y={-21} width={7.6} height={2.8} fill="#161616" />
          <rect x={-3.8} y={-18.9} width={7.6} height={0.6} fill="#d9b35f" />
        </g>
      )}
    </g>
  );
  return pose === "sleep" ? <g transform="rotate(-90) translate(0 -1)">{body}</g> : body;
}

function CrewFigure({ member, place }: { member: DisplayCrew; place: Placed }) {
  const u = 3 * place.scale;
  const coat = coatFor(member.alias);
  const state = labels[member.state];
  const tip = `${member.alias} · ${state} · ${member.project}${member.updated ? ` · last observed ${member.updated.slice(11, 16)} UTC` : ""}`;
  // Plates sit at a fixed height per tier (not per figure scale) so rows line up across sizes.
  const plateY = (place.pose === "sleep" ? -24 : -75) - place.tier * 16;
  const inner = (
    <g className={`crew-figure crew-${member.state}`} transform={`translate(${place.x} ${place.y})`}>
      <title>{tip}</title>
      <g transform={`scale(${u})`}>
        <Sailor pose={place.pose} coat={coat} sub={member.sub} />
      </g>
      {place.pose === "call" && (
        <g transform={`translate(${6 * u + 12} ${-16 * u})`}>
          {/* CSS transforms replace the SVG attribute, so the animation lives on an inner group */}
          <g className="crew-bubble">
            <rect x={-7} y={-12} width={14} height={16} rx={3} fill="#fff4d6" stroke="#2a1f1c" strokeWidth={1.2} />
            <text x={0} y={1} textAnchor="middle" className="crew-bubble-text">!</text>
          </g>
        </g>
      )}
      {place.pose === "sleep" && (
        <text x={10} y={-26} className="crew-zzz">z<tspan dx={2} dy={-5}>z</tspan></text>
      )}
      <g transform={`translate(0 ${plateY})`}>
        <rect x={-30} y={-9} width={60} height={13} rx={3} className="crew-plate" />
        <text x={0} y={1} textAnchor="middle" className="crew-plate-text">{member.alias}</text>
      </g>
    </g>
  );
  const aria = `${member.alias}: ${state}, ${member.project}`;
  return member.href ? (
    <a href={member.href} aria-label={`${aria}. Open ${member.project}`} className="crew-link">{inner}</a>
  ) : (
    <g tabIndex={0} role="img" aria-label={aria} className="crew-link">{inner}</g>
  );
}

function Ship({ crew }: { crew: DisplayCrew[] }) {
  const { placed, overflow } = layoutCrew(crew.map((m, i) => ({ id: String(i), state: m.state, sub: m.sub })));
  const firing = new Set(placed.filter((p) => p.station === "cannons").map((p) => p.x));
  return (
    <svg className="crew-svg" viewBox="0 0 1000 440" role="img" aria-label="The Bosun ship, with each live agent session as a sailor at a station for its state">
      <defs>
        <linearGradient id="crew-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c2236" />
          <stop offset="1" stopColor="#1d4a63" />
        </linearGradient>
      </defs>
      <rect width="1000" height="440" fill="url(#crew-sky)" />
      <circle cx="860" cy="70" r="30" fill="#f1d9a0" opacity="0.9" />
      {[[120, 50], [210, 90], [330, 40], [640, 60], [720, 30], [950, 120]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="#f4ecd2" opacity="0.7" />
      ))}

      {/* rigging lines */}
      <g stroke="#caa877" strokeWidth="1.2" opacity="0.8">
        <line x1="501" y1="48" x2="150" y2="262" />
        <line x1="501" y1="48" x2="880" y2="276" />
        <line x1="501" y1="110" x2="260" y2="268" />
        <line x1="501" y1="110" x2="760" y2="276" />
      </g>
      {/* mast, yards, sails, flag */}
      <rect x="497" y="40" width="8" height="262" fill="#5a3b2a" />
      <rect x="420" y="72" width="162" height="6" fill="#6a4630" />
      <rect x="436" y="150" width="130" height="6" fill="#6a4630" />
      <g className="crew-sail">
        <path d="M426 78 L576 78 L566 146 L436 146 Z" fill="#e9dcb8" />
        <path d="M442 156 L560 156 L552 206 L450 206 Z" fill="#e2d2a8" />
        <text x="501" y="118" textAnchor="middle" className="crew-sail-text">✕</text>
      </g>
      <g className="crew-flag">
        <path d="M505 42 L545 48 L505 58 Z" fill="#a8363a" />
      </g>

      {/* hull, with raised quarterdeck (stern, left) and forecastle (bow, right) */}
      <path d="M108 268 L262 268 L262 300 L738 300 L738 280 L896 280 L872 372 Q500 400 150 372 Z" fill="#6e4530" />
      <path d="M150 372 Q500 400 872 372 L862 390 Q500 420 160 390 Z" fill="#3e261c" />
      <g stroke="#5a3826" strokeWidth="2">
        <line x1="130" y1="318" x2="886" y2="318" />
        <line x1="140" y1="342" x2="878" y2="342" />
      </g>
      <rect x="104" y="262" width="160" height="7" fill="#b98050" />
      <rect x="258" y="294" width="484" height="7" fill="#b98050" />
      <rect x="734" y="274" width="166" height="7" fill="#b98050" />
      {[250, 420, 580, 750].map((x) => (
        <circle key={x} cx={x} cy="332" r="7" fill="#15384a" stroke="#d9b35f" strokeWidth="2.5" />
      ))}
      <text x="500" y="364" textAnchor="middle" className="crew-hull-text">BOSUN · X</text>

      {/* captain's cabin: door + lantern; helm */}
      <rect x="118" y="226" width="30" height="42" rx="3" fill="#3b2419" stroke="#d9b35f" strokeWidth="2" />
      <circle cx="142" cy="248" r="2" fill="#d9b35f" />
      <rect x="110" y="214" width="46" height="10" rx="2" fill="#5a3b2a" />
      <rect x="150" y="228" width="6" height="10" fill="#f0b64a" className="crew-lantern" />
      <g transform="translate(262 244)" stroke="#8a5a36" strokeWidth="2.5" fill="none">
        <circle r="12" />
        <line x1="-16" y1="0" x2="16" y2="0" />
        <line x1="0" y1="-16" x2="0" y2="16" />
        <line x1="-11" y1="-11" x2="11" y2="11" />
        <line x1="-11" y1="11" x2="11" y2="-11" />
      </g>
      <rect x="259" y="256" width="6" height="12" fill="#6a4630" />

      {/* cannons beside each gunner slot; the fuse glows when someone waits on a tool */}
      {SLOTS.cannons.map((s) => (
        <g key={s.x} transform={`translate(${s.x + 26} 300)`}>
          <rect x={-10} y={-12} width={26} height={9} rx={4} fill="#262626" />
          <circle cx={-2} cy={-3} r={5} fill="#4a3022" />
          <circle cx={10} cy={-3} r={5} fill="#4a3022" />
          {firing.has(s.x) && <circle cx={-8} cy={-14} r={3} className="crew-fuse" />}
        </g>
      ))}

      {/* bow: barrels and a coil of rope */}
      <g>
        <rect x="806" y="256" width="18" height="24" rx="4" fill="#7a4b2c" stroke="#3e261c" strokeWidth="2" />
        <rect x="846" y="260" width="16" height="20" rx="4" fill="#7a4b2c" stroke="#3e261c" strokeWidth="2" />
        <ellipse cx="770" cy="276" rx="12" ry="4" fill="none" stroke="#caa877" strokeWidth="3" />
      </g>

      {placed.map((p) => <CrewFigure key={p.id} member={crew[Number(p.id)]} place={p} />)}
      {overflow.map((o) => (
        <g key={o.station} transform={`translate(${o.x} ${o.y})`}>
          <rect x={-16} y={-11} width={32} height={16} rx={8} className="crew-plate" />
          <text x={0} y={1} textAnchor="middle" className="crew-plate-text">+{o.count}</text>
        </g>
      ))}

      {placed.length === 0 && (
        <g transform="translate(500 205)">
          <rect x={-190} y={-26} width={380} height={44} rx={8} fill="#f1e2bc" stroke="#6a4630" strokeWidth="3" />
          <text x={0} y={2} textAnchor="middle" className="crew-empty-text">All hands below deck · no live signal right now</text>
        </g>
      )}

      {/* sea in front of the hull */}
      <g className="crew-sea">
        <path d="M-100 392 Q-75 382 -50 392 T0 392 T50 392 T100 392 T150 392 T200 392 T250 392 T300 392 T350 392 T400 392 T450 392 T500 392 T550 392 T600 392 T650 392 T700 392 T750 392 T800 392 T850 392 T900 392 T950 392 T1000 392 T1050 392 T1100 392 L1100 440 L-100 440 Z" fill="#1f5a73" />
        <path d="M-100 410 Q-75 400 -50 410 T0 410 T50 410 T100 410 T150 410 T200 410 T250 410 T300 410 T350 410 T400 410 T450 410 T500 410 T550 410 T600 410 T650 410 T700 410 T750 410 T800 410 T850 410 T900 410 T950 410 T1000 410 T1050 410 T1100 410 L1100 440 L-100 440 Z" fill="#173f55" />
      </g>
    </svg>
  );
}

export function CrewShip({ crew, fleet = [], publicView = false }: { crew: DisplayCrew[]; fleet?: PublicFleet[]; publicView?: boolean }) {
  const [selection, setSelection] = useState("all");
  const projects = [...new Set([...fleet.map((ship) => ship.project), ...crew.map((member) => member.project)])].sort();
  const selected = projects.includes(selection) ? selection : "all";
  const visible = selected === "all" ? crew : crew.filter((member) => member.project === selected);
  return (
    <section className="crew-scene" aria-label="Bosun crew activity">
      <div className="crew-harbour">
        <span className="crew-harbour-title">THE FLEET</span>
        <div className="crew-filters" aria-label="Choose a project ship">
          <button type="button" aria-pressed={selected === "all"} onClick={() => setSelection("all")}>All <small>{crew.length}</small></button>
          {projects.map((project) => <button type="button" key={project} aria-pressed={selected === project} onClick={() => setSelection(project)}>{project} <small>{crew.filter((member) => member.project === project).length}</small></button>)}
        </div>
      </div>
      <div className="crew-frame"><Ship crew={visible} /></div>
      <p className="crew-key" aria-hidden="true">
        <span>at the mast: working</span><span>at a gun: tool running</span><span>at the captain&apos;s door: needs you</span><span>at the bow: ready</span><span>asleep: signal stale</span>
      </p>
      {fleet.length > 0 && <div className="crew-orders" aria-label="Project work summary">
        {fleet.filter((ship) => selected === "all" || ship.project === selected).map((ship) =>
          <div className="crew-order" key={ship.project}><strong>{ship.project}</strong>
            <span>{ship.inProgress} underway · {ship.todo} to do</span></div>)}
      </div>}
      <p className="crew-caption">{publicView ? "Public summary · updates every 10 seconds · details stay private" : "Live session signals · positions reflect observed events"}</p>
      <div className="sr-only" role="status">
        {visible.length ? visible.map((member) => `${member.alias} on ${member.project}: ${labels[member.state]}`).join(". ") : "No live agents right now."}
      </div>
    </section>
  );
}
