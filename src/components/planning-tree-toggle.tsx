"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoredFlags } from "@/lib/hooks/use-stored-flags";

// BXD-60: collapse an idea's sub-ideas on the Planning page. The toggle (inside the
// row, before the IDEA-xx label) and the subtree wrapper are separate components
// sharing one stored flag, so the row itself can stay a server component. Expanded by
// default; a collapsed tree is remembered per browser.
const COLLAPSED_KEY = "bosun-x:planning-collapsed";

export function PlanningTreeToggle({ id, childCount }: { id: string; childCount: number }) {
  const { flags, set } = useStoredFlags(COLLAPSED_KEY);
  // Leaf rows keep an empty slot the same width so IDEA-xx labels stay aligned.
  if (childCount === 0) return <span className="size-5 shrink-0" aria-hidden />;
  const collapsed = Boolean(flags[id]);
  return (
    <button
      type="button"
      onClick={() => set(id, !collapsed)}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Show" : "Hide"} ${childCount} sub-idea${childCount === 1 ? "" : "s"} of ${id}`}
      className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
    >
      <ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} strokeWidth={2} />
    </button>
  );
}

export function PlanningSubtree({ id, children }: { id: string; children: React.ReactNode }) {
  const { flags } = useStoredFlags(COLLAPSED_KEY);
  if (flags[id]) return null;
  return <>{children}</>;
}
