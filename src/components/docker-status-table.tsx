import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContainerSummary } from "@/lib/infra/docker";
import { STATUS_BADGE_CLASS, type StatusLevel } from "@/lib/status-colors";

function levelFor(c: ContainerSummary): StatusLevel {
  if (c.state !== "running") return "down";
  if (c.health?.toLowerCase().includes("unhealthy")) return "attention";
  return "up";
}

export function DockerStatusTable({
  containers,
  projectByService,
}: {
  containers: ContainerSummary[];
  projectByService?: Map<string, { slug: string; name: string }>;
}) {
  if (containers.length === 0) {
    return <p className="text-sm text-muted-foreground py-6">Docker socket unavailable or no containers found.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Container</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Image</TableHead>
          <TableHead>State</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => {
          const owner = projectByService?.get(c.name);
          return (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-sm">{c.name}</TableCell>
              <TableCell>
                {owner ? (
                  <Link href={`/projects/${owner.slug}`} className="text-sky-400 hover:underline text-sm">
                    {owner.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs font-mono">{c.image}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("font-normal capitalize", STATUS_BADGE_CLASS[levelFor(c)])}>
                  {c.state}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground font-mono">{c.status}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
