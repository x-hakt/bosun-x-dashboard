import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { listPortalProjects, getPortalDigest } from "@/lib/portal/projection";
import { PortalSeenBeacon } from "@/components/portal/portal-seen-beacon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalHome() {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const [projects, digest] = await Promise.all([
    listPortalProjects(PORTAL_SLUG, viewer),
    getPortalDigest(PORTAL_SLUG, viewer),
  ]);

  const digestCount = digest.projects.length + digest.ideas.length + digest.notes.length;

  return (
    <div className="space-y-5">
      {viewer.kind === "client" && <PortalSeenBeacon />}

      {digestCount > 0 && (
        <div className="pt-card" style={{ borderColor: "var(--portal-accent)" }}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: "var(--portal-accent)" }}>
              Since your last visit
            </h2>
            {digest.since && (
              <span className="text-[11px]" style={{ color: "var(--portal-ink-faint)" }}>
                {new Date(digest.since).toISOString().slice(0, 10)}
              </span>
            )}
          </div>
          <ul className="space-y-1.5 text-sm">
            {digest.projects.map((p) => (
              <li key={`p-${p.slug}`}>
                <Link href={`/c/projects/${p.slug}`} className="hover:underline">
                  <span style={{ color: "var(--portal-ink-faint)" }}>Project · </span>
                  {p.name}
                </Link>
              </li>
            ))}
            {digest.ideas.map((i) => (
              <li key={`i-${i.id}`}>
                <Link href={`/c/ideas/${i.id}`} className="hover:underline">
                  <span style={{ color: "var(--portal-ink-faint)" }}>Idea · </span>
                  {i.title}
                </Link>
              </li>
            ))}
            {digest.notes.map((n, index) => (
              <li key={`n-${index}`} style={{ color: "var(--portal-ink-soft)" }}>
                <span style={{ color: "var(--portal-ink-faint)" }}>Note · </span>
                {n.title}
              </li>
            ))}
          </ul>
        </div>
      )}

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
