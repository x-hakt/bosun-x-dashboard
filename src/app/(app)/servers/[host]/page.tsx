import { notFound } from "next/navigation";
import Link from "next/link";
import { getHost } from "@/lib/data/hosts";
import { getLocalSnapshot } from "@/lib/infra/local";
import { getRemoteSnapshot, type RemoteSnapshot } from "@/lib/infra/remote";
import { listProjects } from "@/lib/data/projects";
import type { Host } from "@/lib/types";
import { getContainerRefs, displayName } from "@/lib/data/project-display";
import { DockerStatusTable } from "@/components/docker-status-table";
import { StageBadge } from "@/components/stage-badge";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  return `${(n / 1e9).toFixed(1)} GB`;
}

export default async function HostDetailPage(props: { params: Promise<{ host: string }> }) {
  const { host: hostId } = await props.params;
  const host = await getHost(hostId);
  if (!host) notFound();

  const projects = await listProjects();
  const composeServiceToProject = new Map<string, { slug: string; name: string }>();
  for (const p of projects) {
    for (const ref of getContainerRefs(p.meta)) {
      if (ref.compose_service) composeServiceToProject.set(ref.compose_service, { slug: p.meta.slug, name: displayName(p.meta) });
    }
  }
  const projectsOnHost = projects.filter((p) => p.meta.host === host.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{host.name}</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">
          {[host.mesh_ip && `mesh ${host.mesh_ip}`, host.lan_ip && `lan ${host.lan_ip}`, host.public_ip && `public ${host.public_ip}`]
            .filter(Boolean)
            .join(" · ")}
          {" · "}
          {host.connection}
        </p>
      </div>

      {host.live_monitored ? (
        <LiveHost host={host} projectByService={composeServiceToProject} projectsOnHost={projectsOnHost} />
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground italic">
              Not currently monitorable — no access path exists yet (no Docker socket
              locally and no discovery SSH alias for this host).
            </p>
            {projectsOnHost.length > 0 && (
              <div>
                <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
                  Tracked projects on this host
                </div>
                <div className="space-y-1.5">
                  {projectsOnHost.map((p) => (
                    <div key={p.meta.slug} className="flex items-center justify-between text-sm">
                      <Link href={`/projects/${p.meta.slug}`} className="hover:underline font-mono">
                        {displayName(p.meta)}
                      </Link>
                      <StageBadge stage={p.meta.stage} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function LiveHost({
  host,
  projectByService,
  projectsOnHost,
}: {
  host: Host;
  projectByService: Map<string, { slug: string; name: string }>;
  projectsOnHost: Awaited<ReturnType<typeof listProjects>>;
}) {
  const snapshot: RemoteSnapshot = host.ssh_alias
    ? await getRemoteSnapshot(host.ssh_alias).catch(() => ({ containers: [], specs: null, usage: null, stats: new Map() }))
    : await getLocalSnapshot().catch(() => ({ containers: [], specs: null, usage: null, stats: new Map() }));

  const { containers, specs, usage, stats } = snapshot;

  // Per-project resource breakdown: sum the stats of every container whose compose
  // service maps back to a tracked project on this host.
  const byProject = new Map<string, { name: string; slug: string; cpu: number; memBytesApprox: number; containerCount: number }>();
  for (const c of containers) {
    const owner = c.composeService ? projectByService.get(c.composeService) : undefined;
    if (!owner) continue;
    const stat = stats.get(c.name);
    const entry = byProject.get(owner.slug) ?? { name: owner.name, slug: owner.slug, cpu: 0, memBytesApprox: 0, containerCount: 0 };
    entry.containerCount += 1;
    if (stat) {
      entry.cpu += stat.cpuPercent;
      // MemUsage looks like "345MiB / 12.26GiB" — only the "used" side, approx-parsed
      // for a rollup number; the per-container table below shows the exact strings.
      const used = /^([\d.]+)\s*([A-Za-z]+)/.exec(stat.memUsage);
      if (used) {
        const val = Number.parseFloat(used[1]);
        const unit = used[2].toUpperCase();
        const mult = unit.startsWith("GI") ? 1024 ** 3 : unit.startsWith("MI") ? 1024 ** 2 : unit.startsWith("KI") ? 1024 : 1;
        entry.memBytesApprox += val * mult;
      }
    }
    byProject.set(owner.slug, entry);
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Kernel" value={specs?.kernel ?? "—"} compact />
        <StatTile label="Cores" value={specs?.cores ?? "—"} />
        <StatTile
          label="Memory"
          value={usage ? `${fmtBytes(usage.memUsedBytes)} / ${fmtBytes(usage.memTotalBytes)}` : "—"}
          compact
          tone={usage && usage.memUsedBytes / usage.memTotalBytes > 0.9 ? "warn" : "default"}
        />
        <StatTile
          label="Disk"
          value={usage ? `${fmtBytes(usage.diskUsedBytes)} / ${fmtBytes(usage.diskSizeBytes)} (${usage.diskUsePercent}%)` : "—"}
          compact
          tone={usage && usage.diskUsePercent > 85 ? "warn" : "default"}
        />
        <StatTile label="Load (1m)" value={usage ? usage.loadAvg1.toFixed(2) : "—"} />
        <StatTile label="Containers" value={containers.length} />
      </div>

      {byProject.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects on this host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...byProject.values()]
              .sort((a, b) => b.cpu - a.cpu)
              .map((p) => (
                <div key={p.slug} className="flex items-center justify-between text-sm border-b border-border/40 last:border-0 py-1.5">
                  <Link href={`/projects/${p.slug}`} className="hover:underline font-mono">
                    {p.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.containerCount} container{p.containerCount === 1 ? "" : "s"} · {p.cpu.toFixed(1)}% cpu ·{" "}
                    {fmtBytes(p.memBytesApprox)} mem
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {projectsOnHost.length > byProject.size && (
        <p className="text-xs text-muted-foreground font-mono">
          {projectsOnHost.length - byProject.size} tracked project(s) on this host have no matching running container
          right now.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Containers ({containers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DockerStatusTable containers={containers} projectByService={projectByService} />
        </CardContent>
      </Card>
    </>
  );
}
