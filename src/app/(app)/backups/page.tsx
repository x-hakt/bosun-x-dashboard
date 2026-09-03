import Link from "next/link";
import { Check, X, Minus, Clock, GitBranch, Lock, ShieldCheck, ShieldAlert, Loader2, AlertTriangle, HelpCircle } from "lucide-react";
import { getAllBackupStatuses } from "@/lib/data/backup-status";
import { getJobStatuses, type JobState } from "@/lib/data/jobs";
import { getSecretsBackupStatus } from "@/lib/data/secrets-backup";
import { getOffsiteStatus } from "@/lib/data/offsite";
import { loadDestinations } from "@/lib/data/backups";
import { backupRequestPending, restoreTestPending } from "@/lib/data/backup-request";
import { BackupRowActions } from "@/components/backup-row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BackupHealth } from "@/lib/types";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const HEALTH: Record<BackupHealth, { label: string; Icon: typeof Check; c: string }> = {
  ok:         { label: "ok",         Icon: Check,       c: STATUS_TEXT_CLASS.up },
  unverified: { label: "unverified", Icon: ShieldAlert, c: STATUS_TEXT_CLASS.attention },
  stale:      { label: "stale",      Icon: Clock,       c: STATUS_TEXT_CLASS.attention },
  failing:    { label: "failing",    Icon: X,           c: STATUS_TEXT_CLASS.down },
  unknown:    { label: "no data",    Icon: Minus,       c: STATUS_TEXT_CLASS.unknown },
  git:        { label: "git",        Icon: GitBranch,   c: STATUS_TEXT_CLASS.up },
  none:       { label: "none",       Icon: Minus,       c: STATUS_TEXT_CLASS.unknown },
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

const JOB_STATE: Record<JobState, { label: string; Icon: typeof Check; c: string }> = {
  ok:      { label: "ok",              Icon: Check,         c: STATUS_TEXT_CLASS.up },
  running: { label: "running now",     Icon: Loader2,       c: STATUS_TEXT_CLASS.unknown },
  failed:  { label: "failed",          Icon: X,             c: STATUS_TEXT_CLASS.down },
  stalled: { label: "started, stalled", Icon: AlertTriangle, c: STATUS_TEXT_CLASS.down },
  overdue: { label: "no run — overdue", Icon: AlertTriangle, c: STATUS_TEXT_CLASS.attention },
  unknown: { label: "no data",         Icon: HelpCircle,    c: STATUS_TEXT_CLASS.unknown },
};

export default async function BackupsPage() {
  const [statuses, destinations, jobInfo, secrets, offsite] = await Promise.all([
    getAllBackupStatuses(),
    loadDestinations(),
    getJobStatuses(),
    getSecretsBackupStatus(),
    getOffsiteStatus(),
  ]);
  const pending = Object.fromEntries(
    await Promise.all(
      statuses.map(async (s) => [
        s.slug,
        {
          backup: await backupRequestPending(s.slug),
          restore: await restoreTestPending(s.slug),
        },
      ] as const),
    ),
  );
  const snapshotAgeHours = jobInfo.snapshotAgeHours;
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
        <p className="text-xs text-muted-foreground/70 mt-1">
          The <span className="font-mono">Run</span> column queues a job for the host agent (picked up within ~2&nbsp;min).
          Per-store schedule, retention, encryption and the restore key are on each project&rsquo;s page.
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
                <TableHead>Restore-tested</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((s) => {
                const h = HEALTH[s.health];
                const newest = Math.min(...s.stores.map((st) => st.ageHours ?? Infinity));
                const totalBytes = s.stores.reduce((a, st) => a + (st.bytes ?? 0), 0);
                const restores = s.stores.map((st) => st.restore).filter(Boolean);
                const restoreNewest = Math.min(...restores.map((r) => r!.ageHours ?? Infinity));
                const restoreFail = restores.some((r) => !r!.ok);
                const restoreStale = restores.some((r) => r!.stale) || (s.stores.length > 0 && restores.length < s.stores.length);
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
                    <TableCell className="text-sm tabular-nums">
                      {s.method === "git" || s.stores.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : restoreFail ? (
                        <span className={cn("inline-flex items-center gap-1", STATUS_TEXT_CLASS.down)}>
                          <ShieldAlert className="size-3.5" /> failed
                        </span>
                      ) : restores.length === 0 ? (
                        <span className={cn("inline-flex items-center gap-1", restoreStale ? STATUS_TEXT_CLASS.attention : "text-muted-foreground/60")}>
                          <ShieldAlert className="size-3.5" /> never
                        </span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1", restoreStale ? STATUS_TEXT_CLASS.attention : STATUS_TEXT_CLASS.up)}>
                          <ShieldCheck className="size-3.5" /> {fmtAge(restoreNewest)} ago{restoreStale && " · overdue"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">{s.destination ?? "—"}</TableCell>
                    <TableCell>
                      <BackupRowActions
                        slug={s.slug}
                        method={s.method}
                        hasStores={s.stores.length > 0}
                        backupPending={pending[s.slug]?.backup ?? false}
                        restorePending={pending[s.slug]?.restore ?? false}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Scheduled jobs</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="divide-y divide-border/50">
            {jobInfo.jobs.map((j) => {
              const st = JOB_STATE[j.state];
              return (
                <li key={j.name} className="flex items-start gap-2.5 py-2">
                  <span className={cn("inline-flex items-center gap-1.5 shrink-0 w-40", st.c)}>
                    <st.Icon className={cn("size-4", j.state === "running" && "animate-spin")} />
                    <span className="font-mono text-xs">{j.label}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    <span className={st.c}>
                      {j.state === "unknown" && j.inCrontab ? "scheduled · awaiting first heartbeat" : st.label}
                    </span>
                    {j.state === "running" && j.runningForHours !== undefined && ` · for ${fmtAge(j.runningForHours)}`}
                    {j.state === "stalled" && j.runningForHours !== undefined && ` · marker ${fmtAge(j.runningForHours)} old`}
                    {(j.state === "ok" || j.state === "overdue" || j.state === "failed") &&
                      j.ageHours !== undefined && ` · last run ${fmtAge(j.ageHours)} ago`}
                    {j.lastRun?.exit !== undefined && j.lastRun.exit !== 0 && ` (exit ${j.lastRun.exit})`}
                    {!j.inCrontab && j.state === "unknown" && " · not found in crontab"}
                    <span className="block text-muted-foreground/50">
                      every {j.cadenceHours < 24 ? `${j.cadenceHours}h` : `${Math.round(j.cadenceHours / 24)}d`}
                      {j.lastRun?.host && ` · ${j.lastRun.host}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {jobInfo.unmonitored.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground/60 mb-1.5">
                Other scheduled jobs on this host · not monitored by bosun-x
              </p>
              <ul className="space-y-1">
                {jobInfo.unmonitored.map((l, i) => (
                  <li key={i} className="font-mono text-[11px] text-muted-foreground/70 break-all">{l}</li>
                ))}
              </ul>
            </div>
          )}

          {snapshotAgeHours !== undefined ? (
            <p className="text-[11px] text-muted-foreground/50">
              crontab snapshot from {fmtAge(snapshotAgeHours)} ago
              (written by fleet-backup.sh on its nightly run).
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/50">
              No crontab snapshot yet — it is written on the next nightly fleet-backup run.
            </p>
          )}
        </CardContent>
      </Card>

      {secrets.configured && (
        <Card>
          <CardHeader><CardTitle className="text-base">Fleet secrets bundle</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <p className="text-xs text-muted-foreground">
              env files, SSH keys and the Nebula cert — the state kept out of git. Nightly, always age-encrypted.
            </p>
            <div className="flex items-center gap-2">
              {secrets.ok === false ? (
                <span className={cn("inline-flex items-center gap-1.5", STATUS_TEXT_CLASS.down)}>
                  <X className="size-4" /> last run failed{secrets.error ? ` · ${secrets.error}` : ""}
                </span>
              ) : secrets.ok === null ? (
                <span className={cn("inline-flex items-center gap-1.5", STATUS_TEXT_CLASS.attention)}>
                  <ShieldAlert className="size-4" /> never run yet
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    secrets.stale ? STATUS_TEXT_CLASS.attention : STATUS_TEXT_CLASS.up,
                  )}
                >
                  <Lock className="size-4" />
                  {secrets.files ?? 0} paths · {fmtBytes(secrets.bytes)} · {fmtAge(secrets.ageHours)} ago
                  {secrets.stale && " · overdue"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              → {secrets.destination ?? "?"}/_secrets · keep {secrets.keepLast ?? "?"}
              {secrets.pathCount !== undefined && ` · ${secrets.pathCount} source rules`}
            </p>
          </CardContent>
        </Card>
      )}

      {offsite.configured && (
        <Card>
          <CardHeader><CardTitle className="text-base">Off-site copy</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-xs text-muted-foreground">
              The critical set — gp-forms dump, secrets bundle, control-room-data — pushed age-encrypted to{" "}
              {offsite.bucket ? <span className="font-mono">{offsite.kind}:{offsite.bucket}</span> : "object storage"}.
              Survives losing Caspar and the NAS together.
            </p>
            {!offsite.enabled ? (
              <p className={cn("inline-flex items-center gap-1.5 text-xs", STATUS_TEXT_CLASS.attention)}>
                <ShieldAlert className="size-4" /> configured but not enabled — needs a bucket + rclone credentials, then{" "}
                <span className="font-mono">enabled: true</span> in <span className="font-mono">infra/offsite.yml</span>
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {offsite.items.map((it) => (
                  <li key={it.name} className="flex items-center gap-2 py-1.5">
                    {it.ok === true ? (
                      <Check className={cn("size-4", STATUS_TEXT_CLASS.up)} />
                    ) : it.ok === false ? (
                      <X className={cn("size-4", STATUS_TEXT_CLASS.down)} />
                    ) : (
                      <Minus className={cn("size-4", STATUS_TEXT_CLASS.unknown)} />
                    )}
                    <span className="font-mono text-xs">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.ok === true
                        ? `pushed ${fmtAge(it.ageHours)} ago`
                        : it.ok === false
                          ? `failed${it.error ? ` · ${it.error}` : ""}`
                          : "not pushed yet"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {destinations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Destinations</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {destinations.map((d) => (
              <div key={d.id}>
                <span className="font-mono text-xs">{d.id}</span>
                <span className="ml-2 text-[10px] font-mono uppercase text-muted-foreground/60">{d.kind}</span>
                {d.path && <span className="ml-2 text-muted-foreground font-mono text-xs">{d.path}</span>}
                {d.bucket && <span className="ml-2 text-muted-foreground font-mono text-xs">{d.bucket}</span>}
                {d.note && <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
