import Link from "next/link";
import { listPlanningTasks } from "@/lib/data/planning";
import { PlanningTaskRow } from "@/components/planning-task-row";
import { NewPlanningItemForm } from "@/components/new-planning-item-form";
import type { PlanningTaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_ORDER: PlanningTaskStatus[] = ["idea", "planning", "ready", "graduated"];

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

export default async function PlanningPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status: statusFilter } = await props.searchParams;
  const all = await listPlanningTasks();
  // Type "note" tasks live under /planning/notes instead — this page is only the
  // idea -> planning -> ready -> graduated lifecycle.
  const tasks = all.filter((t) => t.meta.type !== "note");
  const childCounts = new Map<string, number>();
  for (const t of tasks) {
    if (t.meta.parent) childCounts.set(t.meta.parent, (childCounts.get(t.meta.parent) ?? 0) + 1);
  }

  const groups = new Map<PlanningTaskStatus, typeof tasks>();
  for (const t of tasks) {
    if (statusFilter && t.meta.status !== statusFilter) continue;
    const list = groups.get(t.meta.status) ?? [];
    list.push(t);
    groups.set(t.meta.status, list);
  }
  for (const list of groups.values()) list.sort((a, b) => compareIds(a.meta.id, b.meta.id));

  const orderedStatuses = STATUS_ORDER.filter((s) => groups.has(s));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Planning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ideas and sub-ideas, thought through in depth before any real project exists. Graduating one is a
            deliberate, separate step — a project only ever gets created once an idea is ready.
          </p>
        </div>
      </div>

      <NewPlanningItemForm kind="idea" />

      {orderedStatuses.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {orderedStatuses.map((status) => (
            <div key={status}>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2 capitalize">
                {status} <span className="text-muted-foreground/60">({groups.get(status)!.length})</span>
              </div>
              <div className="space-y-1.5">
                {groups.get(status)!.map((t) => (
                  <PlanningTaskRow key={t.meta.id} task={t.meta} childCount={childCounts.get(t.meta.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Looking for freeform notes and bookmarks not tied to any idea?{" "}
        <Link href="/planning/notes" className="hover:underline text-sky-400">
          See Notes
        </Link>
        .
      </p>
    </div>
  );
}
