import { discoverGroups } from "@/lib/infra/discovery";
import { StatTile } from "@/components/stat-tile";

// Split out from the main Overview page and wrapped in <Suspense> there — this is the
// one stat that depends on cross-host SSH discovery, which can take several seconds
// on a cold cache (multi-host round trips, one via a jump host). Streaming it in
// separately means the rest of Overview renders immediately instead of blocking on it.
export async function UnregisteredStatTile() {
  const discovered = await discoverGroups();
  const unregistered = discovered.filter((g) => !g.matched).length;
  return <StatTile label="Unregistered found" value={unregistered} tone={unregistered > 0 ? "warn" : "default"} />;
}
