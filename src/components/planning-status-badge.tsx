import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanningTaskStatus } from "@/lib/types";

const STYLE: Record<PlanningTaskStatus, string> = {
  idea: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  planning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ready: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  graduated: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

export function PlanningStatusBadge({ status, className }: { status: PlanningTaskStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal capitalize", STYLE[status], className)}>
      {status}
    </Badge>
  );
}
