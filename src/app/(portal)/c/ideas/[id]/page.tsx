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
        <Link href="/c/ideas" className="text-[13px] text-[var(--portal-ink)]/50 hover:text-[var(--portal-ink)]">
          ← Ideas
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight font-[var(--portal-heading-font)]">{idea.title}</h1>
        <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">{idea.status}</span>
      </div>
      {idea.thread ? (
        <div className="prose prose-invert prose-sm max-w-none rounded-lg border border-white/10 p-4">
          <MarkdownRenderer content={idea.thread} />
        </div>
      ) : (
        <p className="text-sm text-[var(--portal-ink)]/50">No notes on this idea yet.</p>
      )}

      {viewer.kind === "client" && (
        <div className="rounded-lg border border-white/10 p-4">
          <h2 className="mb-2 text-sm font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">Reply</h2>
          <PortalReplyForm ideaId={idea.id} />
        </div>
      )}
    </div>
  );
}
