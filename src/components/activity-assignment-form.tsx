"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignSessionAction, type AssignmentState } from "@/lib/actions/activity-assignment";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary disabled:opacity-50">{pending ? "Assigning…" : "Assign task"}</button>;
}

export function ActivityAssignmentForm({ provider, session }: { provider: "codex" | "claude"; session: string }) {
  const [state, action] = useActionState<AssignmentState, FormData>(assignSessionAction, {});
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Set current task</summary>
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="session" value={session} />
      <label className="grid gap-1">Task key<input name="task" required placeholder="BX-13" className="w-28 rounded-md border border-border bg-background px-2 py-1.5 font-mono" /></label>
      <label className="grid gap-1">Project, if ambiguous<input name="project" placeholder="optional" className="w-32 rounded-md border border-border bg-background px-2 py-1.5" /></label>
      <Submit />
    </form>
    {state.error && <p role="alert" className="mt-2 text-red-400">{state.error}</p>}
    {state.success && <p role="status" className="mt-2 text-emerald-400">{state.success}</p>}
  </details>;
}
