"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissNotification, snoozeNotification } from "@/lib/actions/notifications";

// BXD-99 — Snooze / Done on one inbox row. The source may raise it again later (a
// dismissed one only comes back when its wording changes).
export function NotificationActions({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const btn =
    "rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button type="button" disabled={isPending} className={btn} onClick={() => run(() => snoozeNotification(id, 1))} title="Hide until tomorrow">
        Tomorrow
      </button>
      <button type="button" disabled={isPending} className={btn} onClick={() => run(() => snoozeNotification(id, 7))} title="Hide for a week">
        Next week
      </button>
      <button type="button" disabled={isPending} className={btn} onClick={() => run(() => dismissNotification(id))} title="Done; it comes back only if something changes">
        Done
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
