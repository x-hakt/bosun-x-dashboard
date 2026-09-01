import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContainerStatus } from "@/lib/checks/container-status";
import { STATUS_BADGE_CLASS } from "@/lib/status-colors";

export function ContainerStatusBadge({ status, className }: { status: ContainerStatus; className?: string }) {
  const level = status ?? "unknown";
  return (
    <Badge variant="outline" className={cn("font-normal font-mono", STATUS_BADGE_CLASS[level], className)}>
      {status ?? "n/a"}
    </Badge>
  );
}
