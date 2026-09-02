import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Host } from "@/lib/types";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";

export function HostCard({
  host,
  liveStats,
}: {
  host: Host;
  liveStats?: { containerCount: number; unhealthyCount: number; diskUsedGb?: number; diskTotalGb?: number };
}) {
  return (
    <Link href={`/servers/${host.id}`}>
      <Card className="h-full transition-colors hover:border-foreground/30 hover:bg-accent/40">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-sm">{host.name}</CardTitle>
          <Badge variant="outline" className="font-normal capitalize text-xs">
            {host.role.replace("-", " ")}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-xs font-mono text-muted-foreground">
          {host.mesh_ip && <div>mesh {host.mesh_ip}</div>}
          {host.lan_ip && <div>lan {host.lan_ip}</div>}
          {host.public_ip && <div>public {host.public_ip}</div>}

          <div className="pt-2 border-t border-border/60 mt-2">
            {liveStats ? (
              <div className="space-y-0.5">
                <div className="text-foreground">
                  {liveStats.containerCount} containers
                  {liveStats.unhealthyCount > 0 && (
                    <span className={STATUS_TEXT_CLASS.attention}> · {liveStats.unhealthyCount} unhealthy</span>
                  )}
                </div>
                {liveStats.diskTotalGb !== undefined && (
                  <div>
                    {liveStats.diskUsedGb?.toFixed(1)} / {liveStats.diskTotalGb.toFixed(1)} GB disk
                  </div>
                )}
              </div>
            ) : (
              <span className="italic">reference only — not live-monitored</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
