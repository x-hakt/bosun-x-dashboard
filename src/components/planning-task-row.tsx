import Link from "next/link";
import { PlanningStatusBadge } from "@/components/planning-status-badge";
import { PlanningDeleteButton } from "@/components/planning-delete-button";
import type { PlanningTask } from "@/lib/types";

export function PlanningTaskRow({ task, childCount }: { task: PlanningTask; childCount?: number }) {
  return (
    <div className="group/row flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-accent/40 transition-colors">
      <Link href={`/planning/${task.id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="font-mono text-xs text-muted-foreground shrink-0">{task.id}</span>
        <span className="text-sm truncate">{task.title}</span>
        {task.parent && (
          <span className="text-[10px] text-muted-foreground shrink-0">↳ sub-idea of {task.parent}</span>
        )}
        {Boolean(childCount) && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {childCount} sub-idea{childCount === 1 ? "" : "s"}
          </span>
        )}
      </Link>
      <PlanningStatusBadge status={task.status} className="shrink-0" />
      <PlanningDeleteButton
        id={task.id}
        title={task.title}
        descendantCount={childCount ?? 0}
        className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}
