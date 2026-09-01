"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePlanningTask } from "@/lib/actions/planning";
import { cn } from "@/lib/utils";

export function PlanningDeleteButton({
  id,
  title,
  descendantCount = 0,
  redirectTo,
  className,
  label = false,
}: {
  id: string;
  title: string;
  /** number of sub-ideas that will be removed along with this one */
  descendantCount?: number;
  /** where to go after deleting; when omitted the current view just refreshes */
  redirectTo?: string;
  className?: string;
  /** show a "Delete" text label next to the icon */
  label?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    const extra = descendantCount > 0 ? ` and its ${descendantCount} sub-idea${descendantCount === 1 ? "" : "s"}` : "";
    if (!window.confirm(`Delete “${title}”${extra}? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deletePlanningTask(id);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={run}
        aria-label={`Delete ${id}`}
        title={`Delete ${id}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors",
          "hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:pointer-events-none",
          className,
        )}
      >
        <Trash2 className="size-3.5" />
        {label && <span>{isPending ? "Deleting…" : "Delete"}</span>}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
