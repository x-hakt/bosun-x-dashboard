import Link from "next/link";
import { AlertTriangle, XCircle } from "lucide-react";
import { getBackupAlerts } from "@/lib/data/backup-alerts";
import { cn } from "@/lib/utils";

// BXD-42 — a fleet-wide strip on every page whenever a required backup is
// failing / stale / unverified, a scheduled job is overdue or stalled, or the
// secrets / off-site copy is broken. Renders nothing when everything the agent
// owns is current — silence is the all-clear.
export async function BackupAlertBanner() {
  const { alerts, bad, warn } = await getBackupAlerts();
  if (alerts.length === 0) return null;

  const critical = bad > 0;
  const shown = alerts.slice(0, 4);
  const rest = alerts.length - shown.length;

  return (
    <div
      className={cn(
        "mb-5 rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1.5",
        critical
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium shrink-0",
          critical ? "text-destructive" : "text-amber-300",
        )}
      >
        {critical ? <XCircle className="size-4" /> : <AlertTriangle className="size-4" />}
        {critical
          ? `${bad} backup ${bad === 1 ? "problem" : "problems"}`
          : `${warn} backup ${warn === 1 ? "warning" : "warnings"}`}
      </span>

      <span className="inline-flex flex-wrap items-center gap-1.5 min-w-0">
        {shown.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            title={a.detail}
            className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/50 px-1.5 py-0.5 text-xs text-foreground/90 hover:bg-background"
          >
            <span className={a.severity === "bad" ? "text-destructive" : "text-amber-400"}>&#9679;</span>
            {a.label}
          </Link>
        ))}
        {rest > 0 && (
          <Link href="/backups" className="text-xs text-muted-foreground underline underline-offset-2">
            +{rest} more
          </Link>
        )}
      </span>

      <Link
        href="/backups"
        className="ml-auto text-xs underline underline-offset-2 shrink-0 text-muted-foreground hover:text-foreground"
      >
        Backups &rarr;
      </Link>
    </div>
  );
}
