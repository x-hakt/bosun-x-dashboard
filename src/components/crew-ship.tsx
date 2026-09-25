"use client";

import type { PublicCrew } from "@/lib/activity";
import type { Pose } from "@/lib/crew-scene";

// IDEA-20: the pixel-art pirate shared by the port scene. BXD-81 drew the first sailor;
// BXD-97 made them pirates, each with a look generated from their name (so the same pirate
// looks the same on /activity and the public embed) and a sash in their model's colour.

export const labels: Record<PublicCrew["state"], string> = {
  working: "Working", waiting_for_tool: "Tool running", needs_approval: "Awaiting approval",
  ready_for_prompt: "Ready for orders", finished: "Finished", stale: "Signal stale", unknown: "Unknown",
};

// Sash colour by provider (names are generated, so they say nothing about the model).
const SASH: Record<string, string> = { claude: "#e07a3a", codex: "#2a9d8f" };
export const coatFor = (provider: string) => SASH[provider.toLowerCase()] ?? "#8e7cc3";

type Hat = "tricorn" | "bandana" | "captain" | "none";
export interface Look {
  skin: string;
  shirt: string;
  stripe: string | null;
  trousers: string;
  hat: Hat;
  hatColour: string;
  beard: string | null;
  hair: string;
  eyepatch: boolean;
}

const SKIN = ["#f1c9a0", "#e0a879", "#c68652", "#8d5a3b"];
const SHIRTS: [string, string | null][] = [
  ["#f2eee4", "#b8322f"], ["#f2eee4", "#23395b"], ["#e9dcc0", null], ["#9c2f2a", null],
  ["#23395b", null], ["#3f6b3a", null], ["#c9982f", null], ["#9aa0a6", "#2a2a2a"],
];
const TROUSERS = ["#2a1f1c", "#3b3f5c", "#6b4a2b", "#4a4a4a"];
const HATS: Hat[] = ["tricorn", "bandana", "tricorn", "captain", "bandana", "none"];
const BANDANAS = ["#b8322f", "#23395b", "#3f6b3a", "#c9982f", "#6d3a78"];
const BEARDS = [null, null, "#2a1f1c", "#6b4a2b", "#b5602b", "#9a9a9a"];
const HAIR = ["#2a1f1c", "#6b4a2b", "#b5602b", "#d9c07a"];

function seed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function lookFor(name: string, sub = false): Look {
  const h = seed(name);
  const pick = <T,>(list: T[], shift: number) => list[(h >>> shift) % list.length];
  const [shirt, stripe] = pick(SHIRTS, 3);
  return {
    skin: pick(SKIN, 0),
    shirt,
    stripe,
    trousers: pick(TROUSERS, 6),
    hat: sub ? "bandana" : pick(HATS, 9),
    hatColour: pick(BANDANAS, 12),
    beard: sub ? null : pick(BEARDS, 15),
    hair: pick(HAIR, 18),
    eyepatch: !sub && (h >>> 21) % 4 === 0,
  };
}

function HatShape({ look }: { look: Look }) {
  switch (look.hat) {
    case "tricorn":
      return (
        <g>
          <rect x={-5.5} y={-18.4} width={11} height={1.4} fill="#161616" />
          <rect x={-5.8} y={-19.8} width={1.6} height={1.6} fill="#161616" />
          <rect x={4.2} y={-19.8} width={1.6} height={1.6} fill="#161616" />
          <rect x={-3.8} y={-21} width={7.6} height={2.8} fill="#161616" />
          <rect x={-3.8} y={-18.9} width={7.6} height={0.6} fill="#d9b35f" />
        </g>
      );
    case "captain":
      return (
        <g>
          <rect x={-6.2} y={-18.6} width={12.4} height={1.5} fill="#1b1b1b" />
          <rect x={-4.2} y={-22.4} width={8.4} height={4} fill="#1b1b1b" />
          <rect x={-4.2} y={-19} width={8.4} height={0.6} fill="#d9b35f" />
          <rect x={-0.8} y={-21.4} width={1.6} height={1.6} fill="#efe7d6" />
          <rect x={3} y={-25} width={1} height={4} fill="#b8322f" transform="rotate(25 3.5 -23)" />
        </g>
      );
    case "bandana":
      return (
        <g>
          <rect x={-3.4} y={-18.6} width={6.8} height={2} fill={look.hatColour} />
          <rect x={-4.8} y={-17.8} width={1.5} height={2.6} fill={look.hatColour} />
          <rect x={-2} y={-18.1} width={0.8} height={0.8} fill="#f2eee4" opacity={0.7} />
          <rect x={1.2} y={-17.6} width={0.8} height={0.8} fill="#f2eee4" opacity={0.7} />
        </g>
      );
    default:
      return <rect x={-3.2} y={-18} width={6.4} height={1.6} fill={look.hair} />;
  }
}

function Head({ look, dozing }: { look: Look; dozing?: boolean }) {
  return (
    <g>
      <rect x={-3} y={-17} width={6} height={5} fill={look.skin} />
      {dozing ? <rect x={0.4} y={-14.8} width={1.8} height={0.5} fill="#2a1f1c" /> : <rect x={1} y={-15.4} width={1} height={1} fill="#2a1f1c" />}
      {look.eyepatch && (
        <g>
          <rect x={-3} y={-16.4} width={6} height={0.4} fill="#161616" />
          <rect x={0.4} y={-15.9} width={2} height={1.8} fill="#161616" />
        </g>
      )}
      {look.beard && (
        <g>
          <rect x={-3} y={-13.2} width={6} height={1.4} fill={look.beard} />
          <rect x={-1.6} y={-12} width={3.8} height={1.2} fill={look.beard} />
        </g>
      )}
      <HatShape look={look} />
    </g>
  );
}

// Shirt, stripes and the sash (in the model's colour), on the 1-unit grid.
function Torso({ look, sash }: { look: Look; sash: string }) {
  return (
    <g>
      <rect x={-4} y={-12} width={8} height={7} fill={look.shirt} />
      {look.stripe && [-11, -9.2, -7.4].map((y) => <rect key={y} x={-4} y={y} width={8} height={0.8} fill={look.stripe!} />)}
      <rect x={-4} y={-6.6} width={8} height={1.4} fill={sash} />
      <rect x={2.2} y={-5.4} width={1.2} height={2.2} fill={sash} />
    </g>
  );
}

const Crate = () => <rect x={-5} y={-26} width={10} height={7} fill="#a0703f" stroke="#5a3b2a" strokeWidth={0.6} />;

// A pirate, drawn on a 1-unit grid (feet at 0,0; ~12 units wide, ~21 tall), scaled by the
// caller. Poses change arms and legs; dozing and drinking pirates sit.
export function Sailor({ pose, coat, sub, look, carry }: { pose: Pose; coat: string; sub?: boolean; look?: Look; carry?: boolean }) {
  const lk = look ?? lookFor("", sub);
  const sleeve = lk.shirt;
  const skin = lk.skin;
  const dark = lk.trousers;
  const boots = "#111";

  if (pose === "doze" || pose === "drink") {
    const drinking = pose === "drink";
    return (
      <g className={`crew-body crew-pose-${pose}`} shapeRendering="crispEdges">
        <rect x={-3} y={-3} width={8} height={2} fill={dark} />
        <rect x={4} y={-3} width={2} height={3} fill={dark} />
        <rect x={4} y={-1} width={3} height={1} fill={boots} />
        <g transform="translate(0 2)">
          <Torso look={lk} sash={coat} />
          <rect x={-5} y={-11} width={1.6} height={5} fill={sleeve} />
          {drinking ? (
            <g className="crew-drink">
              <rect x={3.4} y={-15} width={1.6} height={4} fill={sleeve} />
              <rect x={4.4} y={-17.6} width={2.6} height={3} fill="#d9a441" />
              <rect x={4.4} y={-18.2} width={2.6} height={0.8} fill="#f7f1e1" />
              <rect x={7} y={-17} width={0.8} height={1.6} fill="#d9a441" />
            </g>
          ) : (
            <rect x={2} y={-7} width={4} height={1.6} fill={sleeve} />
          )}
          <g transform={drinking ? undefined : "translate(1 1.2)"}>
            <Head look={lk} dozing={!drinking} />
          </g>
        </g>
      </g>
    );
  }

  const up = pose === "haul" || pose === "climb" || carry;
  const arms = up ? (
    <g className={carry ? undefined : "crew-arms"}>
      <rect x={-5} y={-17} width={1.6} height={6} fill={sleeve} />
      <rect x={3.4} y={-17} width={1.6} height={6} fill={sleeve} />
      <rect x={-5} y={-18} width={1.6} height={1.2} fill={skin} />
      <rect x={3.4} y={-18} width={1.6} height={1.2} fill={skin} />
    </g>
  ) : pose === "fire" ? (
    <g>
      <rect x={-5} y={-11} width={1.6} height={5} fill={sleeve} />
      <rect x={3.4} y={-11} width={4} height={1.6} fill={sleeve} />
      <rect x={7.2} y={-11} width={1.2} height={1.4} fill={skin} />
      <rect x={8.2} y={-12.2} width={7} height={0.8} fill="#6b4a2b" transform="rotate(18 8.2 -12)" />
    </g>
  ) : pose === "call" ? (
    <g>
      <rect x={-5} y={-11} width={1.6} height={5} fill={sleeve} />
      <g className="crew-wave">
        <rect x={3.4} y={-18} width={1.6} height={7} fill={sleeve} />
        <rect x={3.4} y={-19.2} width={1.6} height={1.3} fill={skin} />
      </g>
    </g>
  ) : (
    <g>
      <rect x={-5} y={-11} width={1.6} height={5} fill={sleeve} />
      <rect x={3.4} y={-11} width={1.6} height={5} fill={sleeve} />
    </g>
  );
  const legs =
    pose === "walk" ? (
      <g>
        <g className="crew-leg-a"><rect x={-3} y={-5} width={2.4} height={4} fill={dark} /><rect x={-3.4} y={-1} width={3} height={1} fill={boots} /></g>
        <g className="crew-leg-b"><rect x={0.6} y={-5} width={2.4} height={4} fill={dark} /><rect x={0.4} y={-1} width={3} height={1} fill={boots} /></g>
      </g>
    ) : pose === "rest" ? (
      <g>
        <rect x={-3} y={-5} width={7} height={2} fill={dark} />
        <rect x={3} y={-5} width={2} height={5} fill={dark} />
        <rect x={3} y={-1} width={3} height={1} fill={boots} />
      </g>
    ) : (
      <g>
        <rect x={-3} y={-5} width={2.4} height={4} fill={dark} />
        <rect x={0.6} y={-5} width={2.4} height={4} fill={dark} />
        <rect x={-3.4} y={-1} width={3} height={1} fill={boots} />
        <rect x={0.4} y={-1} width={3} height={1} fill={boots} />
      </g>
    );
  return (
    <g className={`crew-body crew-pose-${pose}`} shapeRendering="crispEdges">
      {legs}
      <Torso look={lk} sash={coat} />
      {arms}
      <Head look={lk} />
      {carry && <Crate />}
    </g>
  );
}
