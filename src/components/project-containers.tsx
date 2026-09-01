import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectContainer } from "@/lib/types";
import type { ContainerSummary } from "@/lib/infra/docker";
import { STATUS_BADGE_CLASS, type StatusLevel } from "@/lib/status-colors";

export function ProjectContainers({
  refs,
  liveContainers,
  liveMonitored,
}: {
  refs: ProjectContainer[];
  liveContainers: ContainerSummary[];
  liveMonitored: boolean;
}) {
  if (refs.length === 0) {
    return <p className="text-sm text-muted-foreground">No containers declared for this project.</p>;
  }

  return (
    <div className="space-y-1.5">
      {refs.map((ref, i) => {
        const live = liveMonitored ? liveContainers.find((c) => c.name === ref.compose_service) : undefined;

        let level: StatusLevel = "unknown";
        let label = "not live-monitored";
        if (live) {
          if (live.state !== "running") {
            level = "down";
            label = live.state;
          } else if (live.health?.toLowerCase().includes("unhealthy")) {
            level = "attention";
            label = live.health;
          } else {
            level = "up";
            label = live.health ?? live.state;
          }
        }

        return (
          <div key={i} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
            <span className="font-mono">{ref.compose_service ?? "(unnamed)"}</span>
            <Badge variant="outline" className={cn("font-normal capitalize", STATUS_BADGE_CLASS[level])}>
              {label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
