import { publicCrew, publicFleet } from "@/lib/activity";
import { PORTAL_MODE } from "@/lib/portal/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (PORTAL_MODE) return new Response(null, { status: 404 });
  const [crew, fleet] = await Promise.all([publicCrew(), publicFleet()]);
  return Response.json({ crew, fleet, updated: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
