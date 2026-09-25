import { publicPortFeed } from "@/lib/port-feed";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { ActivityRefresh } from "@/components/activity-refresh";
import { EmbedHeight } from "@/components/embed-height";
import { PortView } from "@/components/port-scene";
import { ShipLogTimeline } from "@/components/ship-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IDEA-20 (BXD-87): the public port and ship's log, from the allowlisted projection only.
export default async function CrewEmbed() {
  if (PORTAL_MODE) return null;
  const feed = await publicPortFeed();
  return <main className="port-embed min-h-screen bg-[#071a2a] p-4 text-[#f5e8c8] space-y-4"><ActivityRefresh /><EmbedHeight />
    <PortView feed={feed} />
    <ShipLogTimeline log={feed.log} publicView />
  </main>;
}
