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
      <h1 className="text-xl font-semibold tracking-tight font-[var(--portal-heading-font)]">Notes</h1>
      {notes.length === 0 ? (
        <p className="text-[var(--portal-ink)]/60 text-sm">No notes shared with you.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n, i) => (
            <li key={i} className="rounded-lg border border-white/10 p-4">
              <h2 className="font-medium">{n.title}</h2>
              {n.body && (
                <div className="prose prose-invert prose-sm max-w-none mt-2">
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
