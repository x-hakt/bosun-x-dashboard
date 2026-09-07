import Link from "next/link";
import { getBackupAlerts } from "@/lib/data/backup-alerts";
import { StatTile } from "@/components/stat-tile";

// BXD-42 — the Overview counterpart of the fleet-wide banner. Same source
// (getBackupAlerts, request-memoised) so the two never disagree.
export async function BackupAlertTile() {
  const { alerts, bad, warn } = await getBackupAlerts();

  if (alerts.length === 0) {
    return <StatTile label="Backups" value="All clear" tone="good" />;
  }

  const value =
    bad > 0 ? `${bad} failing${warn > 0 ? ` · ${warn} warn` : ""}` : `${warn} need attention`;

  return (
    <Link href="/backups" className="contents">
      <StatTile label="Backups" value={value} tone={bad > 0 ? "bad" : "warn"} />
    </Link>
  );
}
