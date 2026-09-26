"use server";

import { revalidatePath } from "next/cache";
import { DATA_DIR } from "@/lib/data/paths";
import { dismiss, snooze } from "@/lib/notifications-core.mjs";
import { updateNotifications } from "@/lib/notifications-store.mjs";

// BXD-99 — the operator's side of the inbox. Sources raise and resolve through
// `npm run notify`; the dashboard only dismisses and snoozes.

function refresh() {
  // The sidebar badge is in the (app) layout, so every page needs the new count.
  revalidatePath("/", "layout");
}

export async function dismissNotification(id: string): Promise<void> {
  await updateNotifications(DATA_DIR, (file) => dismiss(file, id, new Date()));
  refresh();
}

export async function snoozeNotification(id: string, days: number): Promise<void> {
  if (!Number.isFinite(days) || days <= 0 || days > 30) throw new Error("snooze is 1 to 30 days");
  await updateNotifications(DATA_DIR, (file) => snooze(file, id, new Date(Date.now() + days * 86_400_000)));
  refresh();
}
