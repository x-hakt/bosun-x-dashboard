import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { getPortalProject } from "@/lib/portal/projection";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "Up next",
  in_progress: "In progress",
  done: "Done",
};

export default async function PortalProjectPage({ params }: PageProps<"/c/projects/[slug]">) {
  const { slug } = await params;
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  const project = await getPortalProject(PORTAL_SLUG, viewer, slug);
  if (!project) notFound();

  const open = project.tasks.filter((t) => t.status !== "done");
  const done = project.tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/c" className="text-[13px] text-[var(--portal-ink)]/50 hover:text-[var(--portal-ink)]">
          ← Projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight font-[var(--portal-heading-font)]">{project.name}</h1>
        {project.status && (
          <span className="text-[11px] font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">
            {project.status}
          </span>
        )}
      </div>

      {project.summary && (
        <div className="prose prose-invert prose-sm max-w-none rounded-lg border border-white/10 p-4">
          <MarkdownRenderer content={project.summary} />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-mono uppercase tracking-wide text-[var(--portal-ink)]/50">Work</h2>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-[var(--portal-ink)]/50">No tasks to show.</p>
        ) : (
          <ul className="space-y-2">
            {[...open, ...done].map((t, i) => (
              <li key={t.key ?? i} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className={t.status === "done" ? "line-through text-[var(--portal-ink)]/50" : ""}>
                    {t.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-mono uppercase tracking-wide text-[var(--portal-ink)]/40">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                {t.detail && (
                  <div className="prose prose-invert prose-sm max-w-none mt-2 border-t border-white/10 pt-2">
                    <MarkdownRenderer content={t.detail} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
