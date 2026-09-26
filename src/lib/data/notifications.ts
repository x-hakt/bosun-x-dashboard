import { DATA_DIR } from "./paths";
import { visible } from "@/lib/notifications-core.mjs";
import { readNotifications } from "@/lib/notifications-store.mjs";

// BXD-99 — the attention inbox. Rules and storage live in the shared .mjs modules so
// `npm run notify` (cron jobs, agents, planner runs) writes exactly what this reads.

export type NotificationLevel = "info" | "warn" | "urgent";

export interface AppNotification {
  id: string;
  key: string;
  source: string;
  level: NotificationLevel;
  title: string;
  body?: string;
  detail?: string;
  href?: string;
  state: "open" | "dismissed" | "resolved";
  created: string;
  updated: string;
  count: number;
  snoozedUntil?: string;
  closedAt?: string;
}

/** What needs the operator right now, most urgent first. Never throws: a broken file shows as nothing. */
export async function openNotifications(now = new Date()): Promise<AppNotification[]> {
  try {
    return visible(await readNotifications(DATA_DIR), now) as AppNotification[];
  } catch (err) {
    console.error("[notifications] could not read notifications.yml:", err);
    return [];
  }
}
