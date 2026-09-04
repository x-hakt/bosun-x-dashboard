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
      <h1 className="text-2xl">Your projects</h1>
      {projects.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          Nothing shared with you yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {projects.map((p) => (
            <li key={p.slug}>
              <Link href={`/c/projects/${p.slug}`} className="pt-card pt-card--row block">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.name}</span>
                  {p.status && (
                    <span
                      className="text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--portal-ink-faint)" }}
                    >
                      {p.status}
                    </span>
                  )}
                </div>
                {p.updated && (
                  <span className="text-[11px]" style={{ color: "var(--portal-ink-faint)" }}>
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
