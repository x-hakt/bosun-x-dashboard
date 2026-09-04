import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PORTAL_SLUG } from "@/lib/portal/mode";
import { getPortalViewer } from "@/lib/portal/auth";
import { getPortalProject } from "@/lib/portal/projection";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PortalReplyForm } from "@/components/portal/portal-reply-form";

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
        <Link href="/c" className="text-[13px]" style={{ color: "var(--portal-ink-soft)" }}>
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl">{project.name}</h1>
        {project.status && (
          <span
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: "var(--portal-ink-faint)" }}
          >
            {project.status}
          </span>
        )}
      </div>

      {project.summary && (
        <div className="pt-prose">
          <MarkdownRenderer content={project.summary} />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: "var(--portal-ink-soft)" }}>
          Work
        </h2>
        {project.tasks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
            No tasks to show.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {[...open, ...done].map((t, i) => (
              <li key={t.key ?? i} className="pt-card">
                <div className="flex items-start justify-between gap-3">
                  <span style={t.status === "done" ? { color: "var(--portal-ink-faint)", textDecoration: "line-through" } : undefined}>
                    {t.title}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--portal-ink-faint)" }}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                {t.detail && (
                  <div className="pt-prose mt-2 border-t pt-2" style={{ borderColor: "var(--portal-line)", fontSize: "0.9rem" }}>
                    <MarkdownRenderer content={t.detail} />
                  </div>
                )}
                {viewer.kind === "client" && t.id && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--portal-line)" }}>
                    <PortalReplyForm target={{ kind: "task", project: project.slug, taskId: t.id }} />
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
