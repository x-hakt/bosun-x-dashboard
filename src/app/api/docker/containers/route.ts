import { NextResponse } from "next/server";
import { listContainers } from "@/lib/infra/docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const containers = await listContainers();
    return NextResponse.json({ containers });
  } catch (err) {
    return NextResponse.json(
      { containers: [], error: err instanceof Error ? err.message : "Docker socket unavailable" },
      { status: 200 },
    );
  }
}
