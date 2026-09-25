import { publicCrew } from "@/lib/activity";
import { PORTAL_MODE } from "@/lib/portal/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (PORTAL_MODE) return new Response(null, { status: 404 });
  return Response.json({ crew: await publicCrew(), updated: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
