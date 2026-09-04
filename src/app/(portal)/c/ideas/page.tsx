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
      <h1 className="text-2xl">Ideas</h1>
      {ideas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          No idea threads shared with you.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Link href={`/c/ideas/${idea.id}`} className="pt-card pt-card--row block">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{idea.title}</span>
                  <span
                    className="text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--portal-ink-faint)" }}
                  >
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
