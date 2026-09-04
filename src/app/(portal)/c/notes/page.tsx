import { redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { listPortalNotes } from "@/lib/portal/projection";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalNotes() {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const notes = await listPortalNotes(PORTAL_SLUG, viewer);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl">Notes</h1>
      {notes.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          No notes shared with you.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n, i) => (
            <li key={i} className="pt-card">
              <h2 className="font-medium">{n.title}</h2>
              {n.body && (
                <div className="pt-prose mt-2" style={{ fontSize: "0.95rem" }}>
                  <MarkdownRenderer content={n.body} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
