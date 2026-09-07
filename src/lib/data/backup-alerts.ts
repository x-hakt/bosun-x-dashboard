import { cache } from "react";
import { getAllBackupStatuses } from "./backup-status";
import { getJobStatuses } from "./jobs";
import { getSecretsBackupStatus } from "./secrets-backup";
import { getOffsiteStatus } from "./offsite";

// BXD-42 — one place that decides what counts as a *loud* backup/job problem, so
// the fleet-wide banner and the Overview tile always agree. Read-only; combines
// the same sources the /backups page already renders. `bad` = a recovery copy is
// missing or broken right now; `warn` = drifting (overdue, never verified).

export type AlertSeverity = "bad" | "warn";

export interface BackupAlert {
  id: string;
  severity: AlertSeverity;
  label: string; // short — "playtopia backup failing"
  detail?: string; // optional extra context, shown as a tooltip
  href: string; // a project page, or /backups
}

export interface BackupAlertSummary {
  alerts: BackupAlert[];
  bad: number;
  warn: number;
}

export const getBackupAlerts = cache(async (): Promise<BackupAlertSummary> => {
  const [statuses, jobInfo, secrets, offsite] = await Promise.all([
    getAllBackupStatuses(),
    getJobStatuses(),
    getSecretsBackupStatus(),
    getOffsiteStatus(),
  ]);

  const alerts: BackupAlert[] = [];

  // Per-project backup health. Only projects that declare backup_required and use
  // the agent — `git` is covered by its own remote, `none` is deliberate.
  for (const s of statuses) {
    if (!s.required || s.method !== "agent") continue;
    if (s.health === "failing") {
      const bad = s.stores.find((st) => st.ok === false);
      alerts.push({
        id: `backup:${s.slug}`,
        severity: "bad",
        label: `${s.slug} backup failing`,
        detail: bad?.error || (bad ? `${bad.name} errored on its last run` : undefined),
        href: `/projects/${s.slug}`,
      });
    } else if (s.health === "stale") {
      alerts.push({
        id: `backup:${s.slug}`,
        severity: "bad",
        label: `${s.slug} backup stale`,
        detail: "last run succeeded but nothing since — the nightly may have stopped",
        href: `/projects/${s.slug}`,
      });
    } else if (s.health === "unknown") {
      alerts.push({
        id: `backup:${s.slug}`,
        severity: "warn",
        label: `${s.slug} backup never run`,
        href: `/projects/${s.slug}`,
      });
    } else if (s.health === "unverified") {
      alerts.push({
        id: `restore:${s.slug}`,
        severity: "warn",
        label: `${s.slug} restore test overdue`,
        href: `/projects/${s.slug}`,
      });
    }
  }

  // Scheduled jobs — jobs.ts already tells "never started" from "started and
  // died" from "finished with errors" from "overdue".
  for (const j of jobInfo.jobs) {
    if (j.state === "failed" || j.state === "stalled") {
      alerts.push({
        id: `job:${j.name}`,
        severity: "bad",
        label: j.state === "stalled" ? `${j.label} stalled` : `${j.label} failed`,
        detail:
          j.state === "stalled"
            ? "start marker present, never finished"
            : j.lastRun?.exit
              ? `exit ${j.lastRun.exit}`
              : undefined,
        href: "/backups",
      });
    } else if (j.state === "overdue") {
      alerts.push({
        id: `job:${j.name}`,
        severity: "warn",
        label: `${j.label} overdue`,
        detail: j.ageHours !== undefined ? `last run ${Math.round(j.ageHours / 24)}d ago` : undefined,
        href: "/backups",
      });
    }
  }

  // Fleet secrets bundle.
  if (secrets.configured) {
    if (secrets.ok === false) {
      alerts.push({ id: "secrets", severity: "bad", label: "Secrets bundle failed", detail: secrets.error, href: "/backups" });
    } else if (secrets.ok === null) {
      alerts.push({ id: "secrets", severity: "warn", label: "Secrets bundle never run", href: "/backups" });
    } else if (secrets.stale) {
      alerts.push({ id: "secrets", severity: "warn", label: "Secrets bundle overdue", href: "/backups" });
    }
  }

  // Off-site copy — only when it's enabled; "configured but off" is expected.
  if (offsite.enabled) {
    const failed = offsite.items.filter((i) => i.ok === false);
    for (const it of failed) {
      alerts.push({
        id: `offsite:${it.name}`,
        severity: "bad",
        label: `Off-site push failed: ${it.name}`,
        detail: it.error,
        href: "/backups",
      });
    }
    if (failed.length === 0 && offsite.stale) {
      alerts.push({ id: "offsite", severity: "warn", label: "Off-site copy overdue", href: "/backups" });
    }
  }

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "bad" ? -1 : 1));

  return {
    alerts,
    bad: alerts.filter((a) => a.severity === "bad").length,
    warn: alerts.filter((a) => a.severity === "warn").length,
  };
});
