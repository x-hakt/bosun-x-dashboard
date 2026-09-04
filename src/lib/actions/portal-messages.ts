"use server";

import { revalidatePath } from "next/cache";
import { saveClientThreadNotes, markClientThreadReviewed } from "@/lib/data/portal-messages";

// Operator side of CGB-10. Client slugs come from clients.yml (validated
// elsewhere); this just persists whatever the Messages page hands back.

export async function saveOperatorMessageThread(clientSlug: string, content: string): Promise<void> {
  await saveClientThreadNotes(clientSlug, content);
  revalidatePath("/messages");
}

export async function markMessagesReviewed(clientSlug: string): Promise<void> {
  await markClientThreadReviewed(clientSlug);
  revalidatePath("/messages");
}
