import { publicPortFeed } from "@/lib/port-feed";
import { PORTAL_MODE } from "@/lib/portal/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IDEA-20 (BXD-87): the same allowlisted port feed the public embed renders.
export async function GET() {
  if (PORTAL_MODE) return new Response(null, { status: 404 });
  const feed = await publicPortFeed();
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
}
