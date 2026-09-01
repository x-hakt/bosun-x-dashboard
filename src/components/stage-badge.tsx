import { Badge } from "@/components/ui/badge";
import type { ProjectStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_STYLE: Record<ProjectStage, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  paused: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  archived: "bg-zinc-800/40 text-zinc-500 border-zinc-700/40",
};

export function StageBadge({ stage }: { stage: ProjectStage }) {
  return (
    <Badge variant="outline" className={cn("font-normal capitalize", STAGE_STYLE[stage])}>
      {stage}
    </Badge>
  );
}
