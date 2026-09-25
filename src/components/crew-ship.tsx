"use client";

import type { PublicCrew } from "@/lib/activity";
import type { Pose } from "@/lib/crew-scene";

// IDEA-20: the pixel-art sailor shared by the port scene (BXD-81 drew it; the old single
// deck it lived on was replaced by the port's camera in BXD-89).

export const labels: Record<PublicCrew["state"], string> = {
  working: "Working", waiting_for_tool: "Tool running", needs_approval: "Awaiting approval",
  ready_for_prompt: "Ready", finished: "Finished", stale: "Signal stale", unknown: "Unknown",
};

// Coat colour by provider (names are generated, so they say nothing about the model).
const COAT: Record<string, string> = { claude: "#d9773f", codex: "#2a9d8f" };
export const coatFor = (provider: string) => COAT[provider.toLowerCase()] ?? "#8e7cc3";

// A sailor, drawn on a 1-unit grid (feet at 0,0; ~12 units wide, ~21 tall), scaled by
// `u` px per unit. Poses change arms/legs; the whole figure lies down to sleep.
export function Sailor({ pose, coat, sub }: { pose: Pose; coat: string; sub?: boolean }) {
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
    pose === "walk" ? (
      <g>
        <g className="crew-leg-a"><rect x={-3} y={-5} width={2.4} height={4} fill={dark} /><rect x={-3.4} y={-1} width={3} height={1} fill="#111" /></g>
        <g className="crew-leg-b"><rect x={0.6} y={-5} width={2.4} height={4} fill={dark} /><rect x={0.4} y={-1} width={3} height={1} fill="#111" /></g>
      </g>
    ) : pose === "rest" ? (
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
  // BXD-93: stale sailors doze sitting up, slumped, eyes shut: nobody lies on their side.
  const hat = sub ? (
    <rect x={-3.4} y={-18.4} width={6.8} height={1.8} fill="#b8322f" />
  ) : (
    <g>
      <rect x={-5.5} y={-18.4} width={11} height={1.4} fill="#161616" />
      <rect x={-3.8} y={-21} width={7.6} height={2.8} fill="#161616" />
      <rect x={-3.8} y={-18.9} width={7.6} height={0.6} fill="#d9b35f" />
    </g>
  );
  if (pose === "doze") {
    return (
      <g className="crew-body crew-pose-doze" shapeRendering="crispEdges">
        <rect x={-3} y={-3} width={8} height={2} fill={dark} />
        <rect x={4} y={-3} width={2} height={3} fill={dark} />
        <rect x={4} y={-1} width={3} height={1} fill="#111" />
        <g transform="translate(0 2)">
          <rect x={-4} y={-12} width={8} height={7} fill={coat} />
          <rect x={-4} y={-6.4} width={8} height={1.2} fill={dark} />
          <rect x={-5} y={-11} width={1.6} height={5} fill={coat} />
          <rect x={2} y={-7} width={4} height={1.6} fill={coat} />
          <g transform="translate(1 1.2)">
            <rect x={-3} y={-17} width={6} height={5} fill={skin} />
            <rect x={0.4} y={-14.8} width={1.8} height={0.5} fill={dark} />
            {hat}
          </g>
        </g>
      </g>
    );
  }
  const body = (
    <g className={`crew-body crew-pose-${pose}`} shapeRendering="crispEdges">
      {legs}
      <rect x={-4} y={-12} width={8} height={7} fill={coat} />
      <rect x={-4} y={-6.4} width={8} height={1.2} fill={dark} />
      <rect x={-0.6} y={-6.4} width={1.2} height={1.2} fill="#d9b35f" />
      {arms}
      <rect x={-3} y={-17} width={6} height={5} fill={skin} />
      <rect x={1} y={-15.4} width={1} height={1} fill={dark} />
      {hat}
    </g>
  );
  return body;
}
