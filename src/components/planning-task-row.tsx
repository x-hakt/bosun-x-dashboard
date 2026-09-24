import Link from "next/link";
import { PlanningStatusBadge } from "@/components/planning-status-badge";
import { PlanningDeleteButton } from "@/components/planning-delete-button";
import { PlanningTreeToggle } from "@/components/planning-tree-toggle";
import type { PlanningTask } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlanningTaskRow({
  task,
  childCount,
  clientReplies,
  collapsible = false,
}: {
  task: PlanningTask;
  childCount?: number;
  clientReplies?: number;
  /** In a nested tree (Planning page): show the BXD-60 sub-idea chevron slot. */
  collapsible?: boolean;
}) {
  return (
    <div
      className={cn(
        "group/row flex items-center gap-2 rounded-md border border-border/60 py-2 pr-3 hover:bg-accent/40 transition-colors",
        collapsible ? "pl-1.5" : "pl-3",
      )}
    >
      {collapsible && <PlanningTreeToggle id={task.id} childCount={childCount ?? 0} />}
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
      {Boolean(clientReplies) && (
        <span
          className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
          title="Unreviewed client replies"
        >
          {clientReplies} new
        </span>
      )}
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
