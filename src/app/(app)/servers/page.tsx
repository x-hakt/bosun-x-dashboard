import path from "node:path";
import { loadHosts } from "@/lib/data/hosts";
import { getLocalSnapshot } from "@/lib/infra/local";
import { getRemoteSnapshot } from "@/lib/infra/remote";
import { readMarkdownIfExists } from "@/lib/data/markdown";
import { importedDir } from "@/lib/data/paths";
import { HostCard } from "@/components/host-card";
import { TopologyStrip } from "@/components/topology-strip";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function InfraPage() {
  const [hosts, networkMap] = await Promise.all([
    loadHosts(),
    readMarkdownIfExists(path.join(importedDir(), "network-map.md")),
  ]);

  // Each host's own snapshot, not one shared local-host fetch reused for every card —
  // that was the bug: every card showed the local host's own container count/disk regardless
  // of which host it represented. getLocalSnapshot()/getRemoteSnapshot() already have
  // their own TTL caching and internal error handling (see local.ts/remote.ts).
  const snapshots = await Promise.all(
    hosts.map(async (h) => {
      if (!h.live_monitored) return [h.id, null] as const;
      const snapshot = h.ssh_alias ? await getRemoteSnapshot(h.ssh_alias) : await getLocalSnapshot();
      return [h.id, snapshot] as const;
    }),
  );
  const snapshotByHost = new Map(snapshots);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Servers</h1>
        <p className="text-sm text-muted-foreground mt-1">The mesh: hosts, addresses, and what&apos;s actually live-monitored.</p>
      </div>

      <TopologyStrip hosts={hosts} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {hosts.map((h) => {
          const snapshot = snapshotByHost.get(h.id);
          const unhealthy = snapshot
            ? snapshot.containers.filter((c) => c.state === "running" && c.health && c.health !== "healthy").length
            : 0;
          return (
            <HostCard
              key={h.id}
              host={h}
              liveStats={
                snapshot
                  ? {
                      containerCount: snapshot.containers.length,
                      unhealthyCount: unhealthy,
                      diskUsedGb: snapshot.usage ? snapshot.usage.diskUsedBytes / 1e9 : undefined,
                      diskTotalGb: snapshot.usage ? snapshot.usage.diskSizeBytes / 1e9 : undefined,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {networkMap && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Network map</CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="text-sm text-muted-foreground cursor-pointer mb-4">
                Hand-maintained notes on the hosts above (<span className="font-mono text-xs">imported/network-map.md</span>)
              </summary>
              <MarkdownRenderer content={networkMap} />
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
