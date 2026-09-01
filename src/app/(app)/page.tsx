import { Suspense } from "react";
import { listProjects } from "@/lib/data/projects";
import { StatTile } from "@/components/stat-tile";
import { HealthStatTiles } from "@/components/health-stat-tiles";
import { UnregisteredStatTile } from "@/components/unregistered-stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: ProjectStage[] = ["active", "paused", "archived"];

export default async function OverviewPage() {
  // Deliberately NOT discoverGroups() or computeHealth() here — both depend on cross-
  // host SSH (discovery always did; health now does too, since standards checks cover
  // real remote projects rather than instant n/a — see HealthStatTiles). Both stream in
  // separately via their own <Suspense> boundaries below so a cold cache on either
  // (several seconds, worst case) never blocks the rest of this page from rendering.
  const projects = await listProjects();

  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    count: projects.filter((p) => p.meta.stage === stage).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">bosun-x at a glance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Total projects" value={projects.length} />
        <Suspense fallback={<><Skeleton className="h-[68px] rounded-lg" /><Skeleton className="h-[68px] rounded-lg" /></>}>
          <HealthStatTiles />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[68px] rounded-lg" />}>
          <UnregisteredStatTile />
        </Suspense>
        <StatTile
          label="By stage"
          value={byStage.map((s) => `${s.stage[0].toUpperCase()}${s.stage.slice(1)}: ${s.count}`).join(" · ")}
          compact
        />
      </div>
    </div>
  );
}
