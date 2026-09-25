import { publicCrew } from "@/lib/activity";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { ActivityRefresh } from "@/components/activity-refresh";
import { CrewShip } from "@/components/crew-ship";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CrewEmbed() {
  if (PORTAL_MODE) return null;
  const crew = await publicCrew();
  return <main className="min-h-screen bg-[#071a2a] p-4 text-[#f5e8c8]"><ActivityRefresh />
    <CrewShip crew={crew} publicView />
  </main>;
}
