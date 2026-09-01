"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePlanningStatus } from "@/lib/actions/planning";
import { cn } from "@/lib/utils";
import type { PlanningTaskStatus } from "@/lib/types";

const OPTIONS: PlanningTaskStatus[] = ["idea", "planning", "ready", "graduated"];

export function PlanningStatusEditor({ id, status }: { id: string; status: PlanningTaskStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={isPending}
      onChange={(e) =>
        startTransition(async () => {
          await updatePlanningStatus(id, e.target.value);
          router.refresh();
        })
      }
      className={cn(
        "text-xs font-mono rounded-md border border-border/60 bg-card px-2 py-1 capitalize",
        "text-muted-foreground hover:text-foreground transition-colors",
      )}
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o} className="capitalize">
          {o}
        </option>
      ))}
    </select>
  );
}
