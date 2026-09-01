import { listProjects } from "@/lib/data/projects";
import { loadStandards } from "@/lib/data/standards";
import { computeHealth } from "@/lib/checks/health";
import { StatTile } from "@/components/stat-tile";

// Split out from the main Overview page and wrapped in <Suspense> there, same reasoning
// as UnregisteredStatTile — computeHealth() runs the full standards evaluation per
// project, which now includes real remote git/file checks (SSH) for projects on
// hosts with a discovery alias (see target.ts/remote-facts.ts). Before that
// those checks were instant n/a; now they're real round-trips, so this stat needs the
// same streaming treatment the discovery stat already had, not just local-host pages.
export async function HealthStatTiles() {
  const [projects, standards] = await Promise.all([listProjects(), loadStandards()]);
  const healthValues = await Promise.all(projects.map((p) => computeHealth(p, standards)));

  const attention = healthValues.filter((h) => h === "attention").length;
  const healthy = healthValues.filter((h) => h === "healthy").length;

  return (
    <>
      <StatTile label="Healthy" value={healthy} tone="good" />
      <StatTile label="Needs attention" value={attention} tone={attention > 0 ? "warn" : "default"} />
    </>
  );
}
