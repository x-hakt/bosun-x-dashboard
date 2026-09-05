import { Suspense } from "react";
import Link from "next/link";
import { discoverGroups } from "@/lib/infra/discovery";
import { listProjects } from "@/lib/data/projects";
import { displayName } from "@/lib/data/project-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["Live", "Development", "Paused", "Abandoned"];

async function ProjectsOverview({ status }: { status?: string }) {
  const projects = await listProjects();

  const counts = new Map<string, number>();
  for (const project of projects) {
    const key = project.meta.status ?? "Other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const orderedKeys = [
    ...STATUS_ORDER.filter((key) => counts.has(key)),
    ...[...counts.keys()].filter((key) => !STATUS_ORDER.includes(key)).sort(),
  ];
  const needsReview = projects.filter((project) => project.meta.needs_review);

  // No status filter -> every project (unfiltered), still sorted by name. Clicking
  // a chip above narrows to just that status; there's always a full list shown by
  // default, same as the chips themselves imply.
  const filtered = (status ? projects.filter((project) => (project.meta.status ?? "Other") === status) : projects)
    .slice()
    .sort((a, b) => displayName(a.meta).localeCompare(displayName(b.meta)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
        <Link href="/projects" className={cn("hover:text-foreground", !status && "text-foreground")}>
          All <span className="text-muted-foreground/60">{projects.length}</span>
        </Link>
        {orderedKeys.map((key) => (
          <Link
            key={key}
            href={`/projects?status=${encodeURIComponent(key)}`}
            className={cn("hover:text-foreground", status === key && "text-foreground")}
          >
            {key} <span className="text-muted-foreground/60">{counts.get(key)}</span>
          </Link>
        ))}
      </div>

      {needsReview.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-400/90">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{needsReview.length} need review:</span>
          {needsReview.map((project) => (
            <Link key={project.meta.slug} href={`/projects/${project.meta.slug}`} className="font-mono hover:underline">
              {displayName(project.meta)}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{status ?? "All projects"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects with this status.</p>
          ) : (
            filtered.map((project) => (
              <Link
                key={project.meta.slug}
                href={`/projects/${project.meta.slug}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 hover:bg-accent/40"
              >
                <span className="font-mono text-sm truncate">{displayName(project.meta)}</span>
                <ProjectStatusBadge status={project.meta.status} className="h-4 px-1.5 py-0 text-[10px] leading-none" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function DiscoveryResults() {
  const discovered = await discoverGroups();
  const unregistered = discovered.filter((g) => !g.matched && g.reachable);
  const unreachableHosts = discovered.filter((g) => !g.reachable).map((g) => g.host);

  return (
    <>
      {unreachableHosts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border border-border/60 rounded-md px-3 py-2">
          <WifiOff className="size-3.5 shrink-0" />
          <span>
            Couldn&apos;t reach for discovery: <span className="font-mono">{unreachableHosts.join(", ")}</span> — network/SSH
            issue, not a credentials problem if that host is normally reachable.
          </span>
        </div>
      )}

      {unregistered.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="size-4 text-amber-400" />
            <CardTitle className="text-base">Unregistered — found running, not tracked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Discovered via Docker + compose grouping (the local host directly, other hosts
              over SSH). Nothing here is auto-imported — add a{" "}
              <code className="font-mono">project.yml</code> under{" "}
              <code className="font-mono">data/projects/</code> if you want one tracked.
            </p>
            {unregistered.map((g) => (
              <div key={g.key} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5 last:border-0">
                <div>
                  <div className="font-mono">
                    <span className="text-sky-400">{g.host}</span>: {g.folder}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    compose project: {g.composeProject} · {g.containers.length} container{g.containers.length === 1 ? "" : "s"}{" "}
                    ({g.containers.map((c) => c.name).join(", ")})
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default async function ProjectsIndexPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        <p className="text-xs text-muted-foreground mt-1">Pick a project from the sidebar, or review discovery below.</p>
      </div>

      <Suspense fallback={<p className="text-xs text-muted-foreground">Loading…</p>}>
        <ProjectsOverview status={status} />
      </Suspense>

      <Suspense fallback={<p className="text-xs text-muted-foreground">Checking discovery state…</p>}>
        <DiscoveryResults />
      </Suspense>
    </div>
  );
}
