import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { getPortalIdea } from "@/lib/portal/projection";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PortalReplyForm } from "@/components/portal/portal-reply-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalIdeaPage({ params }: PageProps<"/c/ideas/[id]">) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const idea = await getPortalIdea(PORTAL_SLUG, viewer, id);
  if (!idea) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/c/ideas" className="text-[13px]" style={{ color: "var(--portal-ink-soft)" }}>
          ← Ideas
        </Link>
        <h1 className="mt-1 text-2xl">{idea.title}</h1>
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--portal-ink-faint)" }}>
          {idea.status}
        </span>
      </div>

      {idea.thread ? (
        <div className="pt-prose">
          <MarkdownRenderer content={idea.thread} />
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          No notes on this idea yet.
        </p>
      )}

      {viewer.kind === "client" && (
        <div className="pt-card">
          <h2 className="mb-2 text-[13px] font-medium uppercase tracking-wide" style={{ color: "var(--portal-ink-soft)" }}>
            Reply
          </h2>
          <PortalReplyForm target={{ kind: "idea", ideaId: idea.id }} />
        </div>
      )}
    </div>
  );
}
