import type { PublicCrew } from "@/lib/activity";

const labels: Record<PublicCrew["state"], string> = {
  working: "Working", waiting_for_tool: "Tool running", needs_approval: "Awaiting approval",
  ready_for_prompt: "Ready", finished: "Finished", stale: "Signal stale", unknown: "Unknown",
};

export function CrewShip({ crew, publicView = false }: { crew: PublicCrew[]; publicView?: boolean }) {
  return (
    <section className="crew-scene" aria-label="Bosun crew activity">
      <div className="crew-sky" aria-hidden="true"><span className="crew-sun" /><span className="crew-cloud" /></div>
      <div className="crew-mast" aria-hidden="true"><span className="crew-sail" /><span className="crew-flag">✕</span></div>
      <div className="crew-deck">
        <div className="crew-rail" aria-hidden="true" />
        <div className="crew-stations">
          {crew.length ? crew.slice(0, 8).map((member, index) => (
            <div className={`crew-station crew-${member.state}`} key={`${member.alias}-${index}`}>
              <span className="crew-avatar" aria-hidden="true">{member.state === "needs_approval" ? "!" : index % 2 ? "✦" : "✧"}</span>
              <span className="crew-name">{member.alias}</span>
              <span className="crew-state">{labels[member.state]}</span>
              <span className="crew-project">{member.project}</span>
            </div>
          )) : <p className="crew-empty">The deck is quiet. No approved crew are active right now.</p>}
        </div>
      </div>
      <div className="crew-hull" aria-hidden="true"><span>BOSUN · X</span></div>
      <div className="crew-sea" aria-hidden="true" />
      <p className="crew-caption">{publicView ? "Public summary · updates every 10 seconds · details stay private" : "Live session signals · labels reflect observed events"}</p>
      <div className="sr-only" role="status">
        {crew.length ? crew.map((member) => `${member.alias} on ${member.project}: ${labels[member.state]}`).join(". ") : "No approved crew are active right now."}
      </div>
    </section>
  );
}
