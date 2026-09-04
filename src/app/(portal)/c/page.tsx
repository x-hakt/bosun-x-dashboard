import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { listPortalProjects } from "@/lib/portal/projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalHome() {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const projects = await listPortalProjects(PORTAL_SLUG, viewer);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight font-[var(--portal-heading-font)]">Your projects</h1>
      {projects.length === 0 ? (
        <p className="text-[var(--portal-ink)]/60 text-sm">Nothing shared with you yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/c/projects/${p.slug}`}
                className="block rounded-lg border border-white/10 hover:border-[var(--portal-accent)] px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.name}</span>
                  {p.status && (
                    <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">
                      {p.status}
                    </span>
                  )}
                </div>
                {p.updated && (
                  <span className="text-[11px] text-[var(--portal-ink)]/40">
                    updated {new Date(p.updated).toISOString().slice(0, 10)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
