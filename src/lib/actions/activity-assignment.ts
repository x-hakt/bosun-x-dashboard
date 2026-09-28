"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAllowedEmail, isAuthEnabled } from "@/lib/auth-config";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { readActivity } from "@/lib/activity";
import { assignTask } from "bosun-x/lib/activity.mjs";

export type AssignmentState = { error?: string; success?: string };

export async function assignSessionAction(_previous: AssignmentState, form: FormData): Promise<AssignmentState> {
  if (PORTAL_MODE) return { error: "Task assignments are available only to the operator." };
  if (isAuthEnabled && !await isAllowedEmail((await auth())?.user?.email)) return { error: "Sign in as the operator." };

  const provider = String(form.get("provider") ?? "");
  const session = String(form.get("session") ?? "");
  const task = String(form.get("task") ?? "").trim().toUpperCase();
  const project = String(form.get("project") ?? "").trim() || undefined;
  if (provider !== "codex" && provider !== "claude") return { error: "Unknown agent." };
  const { crew } = await readActivity();
  const member = crew.find((entry) => entry.provider === provider && entry.key === `${provider}:${session}`);
  if (!member) return { error: "That session is no longer in the recent activity window." };
  try {
    const assigned = await assignTask({ task, project, provider, session, host: member.host || undefined });
    revalidatePath("/activity");
    return { success: `Assigned ${assigned.task} (${assigned.project}).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not assign that task." };
  }
}
