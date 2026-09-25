import Link from "next/link";
import { listPlanningTasks, clientReplyStatus } from "@/lib/data/planning";
import { PlanningTaskRow } from "@/components/planning-task-row";
import { PlanningSubtree } from "@/components/planning-tree-toggle";
import { NewPlanningItemForm } from "@/components/new-planning-item-form";
import type { PlanningTaskStatus, PlanningTaskWithDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import { planningStatusAccent } from "@/lib/status-colors";

export const dynamic = "force-dynamic";

const STATUS_ORDER: PlanningTaskStatus[] = ["idea", "planning", "ready", "graduated", "archived"];

function idParts(id: string): number[] {
  return id
    .split(/[-.]/)
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => !Number.isNaN(n));
}

function compareIds(a: string, b: string): number {
  const pa = idParts(a);
  const pb = idParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

// A root either has no parent, or its parent id doesn't resolve (orphan —
// treated as a root rather than silently dropped).
function isRoot(task: PlanningTaskWithDoc, idSet: Set<string>): boolean {
  return !task.meta.parent || !idSet.has(task.meta.parent);
}

// Recursively nests every sub-idea directly under its parent, regardless of
// which status bucket the parent landed in — a graduated idea and its
// still-idea sub-ideas render together instead of splitting across sections.
function PlanningTree({
  task,
  depth,
  childrenByParent,
  unseenReplies,
}: {
  task: PlanningTaskWithDoc;
  depth: number;
  childrenByParent: Map<string, PlanningTaskWithDoc[]>;
  unseenReplies: Map<string, number>;
}) {
  const children = childrenByParent.get(task.meta.id) ?? [];
  return (
    <div className={cn(depth > 0 && "border-l border-border/60 pl-3")} style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      <PlanningTaskRow
        task={task.meta}
        childCount={children.length || undefined}
        clientReplies={unseenReplies.get(task.meta.id)}
        collapsible
      />
      {children.length > 0 && (
        <PlanningSubtree id={task.meta.id}>
          <div className="mt-1.5 space-y-1.5">
            {children.map((child) => (
              <PlanningTree
                key={child.meta.id}
                task={child}
                depth={depth + 1}
                childrenByParent={childrenByParent}
                unseenReplies={unseenReplies}
              />
            ))}
          </div>
        </PlanningSubtree>
      )}
    </div>
  );
}

export default async function PlanningPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status: statusFilter } = await props.searchParams;
  const allTasks = await listPlanningTasks();
  const unseenReplies = new Map(allTasks.map((t) => [t.meta.id, clientReplyStatus(t).unseen]));

  const idSet = new Set(allTasks.map((t) => t.meta.id));
  const childrenByParent = new Map<string, PlanningTaskWithDoc[]>();
  for (const t of allTasks) {
    if (!t.meta.parent || !idSet.has(t.meta.parent)) continue;
    childrenByParent.set(t.meta.parent, [...(childrenByParent.get(t.meta.parent) ?? []), t]);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => compareIds(a.meta.id, b.meta.id));

  const roots = allTasks.filter((t) => isRoot(t, idSet));

  // A root "matches" a status filter if it does, or any descendant does — a
  // filter narrows which trees show, it doesn't prune sub-ideas out of a
  // tree that's shown for context.
  function subtreeMatchesFilter(task: PlanningTaskWithDoc): boolean {
    if (!statusFilter) return true;
    if (task.meta.status === statusFilter) return true;
    return (childrenByParent.get(task.meta.id) ?? []).some(subtreeMatchesFilter);
  }

  const visibleRoots = roots.filter(subtreeMatchesFilter).sort((a, b) => compareIds(a.meta.id, b.meta.id));

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Planning</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ideas and sub-ideas, thought through in depth before any real project exists. Graduating one is a
          deliberate, separate step — a project only ever gets created once an idea is ready.
        </p>
      </div>
    </div>
  );

  const footer = (
    <p className="text-xs text-muted-foreground">
      Just something to remember, not an idea to build?{" "}
      <Link href="/notes" className="hover:underline text-sky-400">
        See Notes
      </Link>
      .
    </p>
  );

  // Filtered view: a flat list of matching trees, no status-section headers —
  // grouping by the root's own status would be misleading when the reason a
  // tree is showing is a sub-idea's status, not the root's.
  if (statusFilter) {
    return (
      <div className="space-y-6">
        {header}
        <NewPlanningItemForm />
        {visibleRoots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Nothing here yet.</p>
        ) : (
          <div className="space-y-1.5">
            {visibleRoots.map((task) => (
              <PlanningTree
                key={task.meta.id}
                task={task}
                depth={0}
                childrenByParent={childrenByParent}
                unseenReplies={unseenReplies}
              />
            ))}
          </div>
        )}
        {footer}
      </div>
    );
  }

  const groups = new Map<PlanningTaskStatus, PlanningTaskWithDoc[]>();
  for (const t of roots) {
    const list = groups.get(t.meta.status) ?? [];
    list.push(t);
    groups.set(t.meta.status, list);
  }
  for (const list of groups.values()) list.sort((a, b) => compareIds(a.meta.id, b.meta.id));

  const orderedStatuses = STATUS_ORDER.filter((s) => groups.has(s));

  return (
    <div className="space-y-6">
      {header}
      <NewPlanningItemForm />

      {orderedStatuses.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {orderedStatuses.map((status) => {
            const accent = planningStatusAccent(status);
            return (
              <div key={status}>
                <Link
                  href={`/planning?status=${status}`}
                  className={cn(
                    "inline-flex items-center gap-2 mb-2 text-xs font-mono font-semibold uppercase tracking-wider hover:underline",
                    accent.text,
                  )}
                >
                  {status} <span className="opacity-50">{groups.get(status)!.length}</span>
                </Link>
                <div className={cn("space-y-1.5 border-l pl-3", accent.border)}>
                  {groups.get(status)!.map((task) => (
                    <PlanningTree
                      key={task.meta.id}
                      task={task}
                      depth={0}
                      childrenByParent={childrenByParent}
                      unseenReplies={unseenReplies}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {footer}
    </div>
  );
}
