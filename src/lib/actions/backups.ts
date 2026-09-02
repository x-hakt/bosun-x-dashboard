"use server";

import { requestBackup, requestRestoreTest } from "@/lib/data/backup-request";

// Writes the request file the fleet-backup agent drains on its next `--requests`
// pass (host cron, every 2 min). bosun-x never runs the backup itself.
export async function triggerBackup(slug: string): Promise<void> {
  await requestBackup(slug);
}

// Same handshake for a restore test — the agent hands it to fleet-restore-test.sh.
export async function triggerRestoreTest(slug: string): Promise<void> {
  await requestRestoreTest(slug);
}
