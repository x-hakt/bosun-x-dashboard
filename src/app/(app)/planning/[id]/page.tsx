import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlanningTask, listPlanningTasks, clientReplyStatus } from "@/lib/data/planning";
import { loadClientRegistry } from "@/lib/data/clients";
import { SharingControl } from "@/components/portal/sharing-control";
import { PlanningClientRepliesNotice } from "@/components/planning-client-replies-notice";
import { PlanningStatusEditor } from "@/components/planning-status-editor";
import { PlanningNotesEditor } from "@/components/planning-notes-editor";
import { GraduatedLinkEditor } from "@/components/graduated-link-editor";
import { NewPlanningItemForm } from "@/components/new-planning-item-form";
import { PlanningTaskRow } from "@/components/planning-task-row";
import { PlanningDeleteButton } from "@/components/planning-delete-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PlanningDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const task = await getPlanningTask(id);
  if (!task) notFound();

  const all = await listPlanningTasks();
  const children = all.filter((t) => t.meta.parent === id);
  const parent = task.meta.parent ? await getPlanningTask(task.meta.parent) : null;
  const clientRegistry = await loadClientRegistry();
  const replyStatus = clientReplyStatus(task);
  const childReplies = new Map(all.map((t) => [t.meta.id, clientReplyStatus(t).unseen]));

  const grandchildCounts = new Map<string, number>();
  for (const t of all) {
    if (t.meta.parent) grandchildCounts.set(t.meta.parent, (grandchildCounts.get(t.meta.parent) ?? 0) + 1);
  }
  const descendantCount = all.filter((t) => t.meta.id.startsWith(`${id}.`)).length;
  const redirectAfterDelete = parent ? `/planning/${parent.meta.id}` : "/planning";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{task.meta.id}</p>
          <h1 className="text-lg font-semibold tracking-tight">{task.meta.title}</h1>
          {parent && (
            <p className="text-xs text-muted-foreground mt-1">
              Sub-idea of{" "}
              <Link href={`/planning/${parent.meta.id}`} className="hover:underline font-mono">
                {parent.meta.id} — {parent.meta.title}
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PlanningStatusEditor id={task.meta.id} status={task.meta.status} />
          <PlanningDeleteButton
            id={task.meta.id}
            title={task.meta.title}
            descendantCount={descendantCount}
            redirectTo={redirectAfterDelete}
            label
          />
        </div>
      </div>

      {replyStatus.unseen > 0 && (
        <PlanningClientRepliesNotice id={task.meta.id} unseen={replyStatus.unseen} />
      )}

      {task.meta.status === "graduated" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Graduated project</CardTitle>
          </CardHeader>
          <CardContent>
            <GraduatedLinkEditor id={task.meta.id} projectSlug={task.meta.graduated_project} />
          </CardContent>
        </Card>
      )}

      {clientRegistry.portals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client portal</CardTitle>
          </CardHeader>
          <CardContent>
            <SharingControl
              kind="planning"
              id={task.meta.id}
              portals={clientRegistry.portals.map((p) => ({ slug: p.slug, name: p.name }))}
              clients={clientRegistry.clients.map((c) => ({ slug: c.slug, name: c.name, portal: c.portal }))}
              current={{ portals: task.meta.portals ?? [], shared_with: task.meta.shared_with ?? [] }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanningNotesEditor id={task.meta.id} initialContent={task.notes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sub-ideas ({children.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {children.length > 0 && (
            <div className="space-y-1.5">
              {children.map((c) => (
                <PlanningTaskRow
                  key={c.meta.id}
                  task={c.meta}
                  childCount={grandchildCounts.get(c.meta.id)}
                  clientReplies={childReplies.get(c.meta.id)}
                />
              ))}
            </div>
          )}
          <NewPlanningItemForm parent={task.meta.id} />
        </CardContent>
      </Card>
    </div>
  );
}
