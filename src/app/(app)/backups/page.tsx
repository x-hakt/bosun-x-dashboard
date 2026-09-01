import Link from "next/link";
import { Check, X, Minus, Clock, GitBranch, Lock } from "lucide-react";
import { getAllBackupStatuses } from "@/lib/data/backup-status";
import { loadDestinations } from "@/lib/data/backups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BackupHealth } from "@/lib/types";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const HEALTH: Record<BackupHealth, { label: string; Icon: typeof Check; c: string }> = {
  ok:      { label: "ok",       Icon: Check,     c: STATUS_TEXT_CLASS.up },
  stale:   { label: "stale",    Icon: Clock,     c: STATUS_TEXT_CLASS.attention },
  failing: { label: "failing",  Icon: X,         c: STATUS_TEXT_CLASS.down },
  unknown: { label: "no data",  Icon: Minus,     c: STATUS_TEXT_CLASS.unknown },
  git:     { label: "git",      Icon: GitBranch, c: STATUS_TEXT_CLASS.up },
  none:    { label: "none",     Icon: Minus,     c: STATUS_TEXT_CLASS.unknown },
};

function fmtBytes(n?: number) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function fmtAge(h?: number) {
  if (h === undefined) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export default async function BackupsPage() {
  const [statuses, destinations] = await Promise.all([getAllBackupStatuses(), loadDestinations()]);
  const active = statuses.filter((s) => s.required);
  const lastRun = Math.min(
    ...active.flatMap((s) => s.stores.map((st) => st.ageHours ?? Infinity)),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Backups</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {active.length} project{active.length === 1 ? "" : "s"} require backups.
          {Number.isFinite(lastRun) && ` Most recent run ${fmtAge(lastRun)} ago.`}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fleet</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead>Newest</TableHead>
                <TableHead>Destination</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((s) => {
                const h = HEALTH[s.health];
                const newest = Math.min(...s.stores.map((st) => st.ageHours ?? Infinity));
                const totalBytes = s.stores.reduce((a, st) => a + (st.bytes ?? 0), 0);
                return (
                  <TableRow key={s.slug}>
                    <TableCell>
                      <Link href={`/projects/${s.slug}`} className="hover:underline font-medium">{s.slug}</Link>
                      {!s.required && <span className="ml-2 text-[10px] font-mono uppercase text-muted-foreground/50">optional</span>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1.5 text-sm", h.c)}>
                        <h.Icon className="size-4" />{h.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.method === "git"
                        ? "git remote"
                        : s.stores.length === 0
                          ? "—"
                          : (
                            <span className="font-mono text-xs">
                              {s.stores.map((st) => (
                                <span key={st.name} className="inline-flex items-center gap-1 mr-2">
                                  {st.name}{st.encrypted && <Lock className="size-3" />}
                                </span>
                              ))}
                            </span>
                          )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {s.method === "git" ? "continuous" : Number.isFinite(newest)
                        ? `${fmtAge(newest)} ago${totalBytes ? ` · ${fmtBytes(totalBytes)}` : ""}`
                        : "never"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">{s.destination ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {destinations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Destinations</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {destinations.map((d) => (
              <div key={d.id}>
                <span className="font-mono text-xs">{d.id}</span>
                <span className="ml-2 text-[10px] font-mono uppercase text-muted-foreground/60">{d.kind}</span>
                {d.path && <span className="ml-2 text-muted-foreground font-mono text-xs">{d.path}</span>}
                {d.note && <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
