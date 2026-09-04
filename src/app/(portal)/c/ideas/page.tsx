import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { listPortalIdeas } from "@/lib/portal/projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalIdeas() {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const ideas = await listPortalIdeas(PORTAL_SLUG, viewer);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight font-[var(--portal-heading-font)]">Ideas</h1>
      {ideas.length === 0 ? (
        <p className="text-[var(--portal-ink)]/60 text-sm">No idea threads shared with you.</p>
      ) : (
        <ul className="space-y-2">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Link
                href={`/c/ideas/${idea.id}`}
                className="block rounded-lg border border-white/10 hover:border-[var(--portal-accent)] px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{idea.title}</span>
                  <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">
                    {idea.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
