import Link from "next/link";
import { getProjectUsage, type UsageRange } from "@/lib/infra/capacity";
import { fmtBytes, fmtCores } from "@/components/capacity-bar";
import { UsageSparkline } from "@/components/usage-sparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RANGES: { key: UsageRange; label: string; caption: string }[] = [
  { key: "24h", label: "24 h", caption: "last 24 hours, 15-minute buckets" },
  { key: "14d", label: "14 d", caption: "last 14 days, 2-hour buckets" },
];

// BXD-71: RAM per project on one server over time, from the capacity sampler's history.
// Server-rendered; the range toggle is a plain link (?range=).
export async function ProjectUsageCard({ hostId, range }: { hostId: string; range: UsageRange }) {
  const usage = await getProjectUsage(hostId, range).catch(() => []);
  if (usage.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No usage history for this host yet. Per-project RAM over time shows here once the capacity sampler has run
        (docs/capacity.md, Setup).
      </p>
    );
  }
  const current = RANGES.find((r) => r.key === range)!;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Usage history</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            RAM per project, {current.caption}. Dashed: p95. Tick: peak. A break in the line: no samples then.
          </p>
        </div>
        <nav aria-label="Usage history range" className="flex rounded-md border border-border text-xs font-mono">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`?range=${r.key}`}
              scroll={false}
              aria-current={r.key === range ? "true" : undefined}
              className={cn(
                "px-2.5 py-1 first:rounded-l-md last:rounded-r-md",
                r.key === range ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {usage.map((p) => (
          <div key={p.slug} className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <Link href={`/projects/${p.slug}`} className="min-w-0 truncate font-mono hover:underline">
                {p.name}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">
                p95 {fmtBytes(p.mem.p95)} · peak {fmtBytes(p.mem.peak)}
              </span>
            </div>
            <UsageSparkline
              series={p.mem}
              status={p.status}
              label={`${p.name} RAM, ${current.caption}: p95 ${fmtBytes(p.mem.p95)}, peak ${fmtBytes(p.mem.peak)}`}
            />
            <div className="flex flex-wrap justify-between gap-x-2 font-mono text-[11px] text-muted-foreground">
              <span>now {p.mem.last === null ? "—" : fmtBytes(p.mem.last)}</span>
              <span>cpu p95 {fmtCores(p.cpu.p95)}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
