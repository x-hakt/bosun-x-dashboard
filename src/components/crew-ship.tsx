"use client";

import { useState } from "react";
import type { PublicCrew, PublicFleet } from "@/lib/activity";

const labels: Record<PublicCrew["state"], string> = {
  working: "Working", waiting_for_tool: "Tool running", needs_approval: "Awaiting approval",
  ready_for_prompt: "Ready", finished: "Finished", stale: "Signal stale", unknown: "Unknown",
};

type DisplayCrew = PublicCrew & { href?: string };

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
      <div className="crew-sky" aria-hidden="true"><span className="crew-sun" /><span className="crew-cloud" /></div>
      <div className="crew-mast" aria-hidden="true"><span className="crew-sail" /><span className="crew-flag">✕</span></div>
      <div className="crew-deck">
        <div className="crew-rail" aria-hidden="true" />
        <div className="crew-stations">
          {visible.length ? visible.slice(0, 8).map((member, index) => {
            const contents = <>
              <span className="crew-avatar" aria-hidden="true">{member.state === "needs_approval" ? "!" : index % 2 ? "✦" : "✧"}</span>
              <span className="crew-name">{member.alias}</span>
              <span className="crew-state">{labels[member.state]}</span>
              <span className="crew-project">{member.project}</span>
            </>;
            return member.href
              ? <a className={`crew-station crew-${member.state}`} href={member.href} key={`${member.alias}-${index}`} aria-label={`${member.alias}, ${labels[member.state]}, open ${member.project}`}>{contents}</a>
              : <div className={`crew-station crew-${member.state}`} key={`${member.alias}-${index}`}>{contents}</div>;
          }) : <p className="crew-empty">No live agent signal right now. Select a project to see its queued work below.</p>}
        </div>
        {visible.length > 8 && <p className="crew-overflow">+{visible.length - 8} more crew in the roster below</p>}
      </div>
      <div className="crew-hull" aria-hidden="true"><span>BOSUN · X</span></div>
      {fleet.length > 0 && <div className="crew-orders" aria-label="Project work summary">
        {fleet.filter((ship) => selected === "all" || ship.project === selected).map((ship) =>
          <div className="crew-order" key={ship.project}><strong>{ship.project}</strong>
            <span>{ship.inProgress} underway · {ship.todo} to do</span></div>)}
      </div>}
      <div className="crew-sea" aria-hidden="true" />
      <p className="crew-caption">{publicView ? "Public summary · updates every 10 seconds · details stay private" : "Live session signals · labels reflect observed events"}</p>
      <div className="sr-only" role="status">
        {visible.length ? visible.map((member) => `${member.alias} on ${member.project}: ${labels[member.state]}`).join(". ") : "No live agents right now."}
      </div>
    </section>
  );
}
