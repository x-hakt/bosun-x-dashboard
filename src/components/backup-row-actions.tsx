"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck } from "lucide-react";
import type { BackupMethod } from "@/lib/types";
import { triggerBackup, triggerRestoreTest } from "@/lib/actions/backups";
import { cn } from "@/lib/utils";

// The per-row "back up now" / "test restore" controls on /backups. Both just
// write a request file that the host agent's --requests pass picks up within
// ~2 min — the dashboard never runs a backup or touches a container itself.
export function BackupRowActions({
  slug,
  method,
  hasStores,
  backupPending,
  restorePending,
}: {
  slug: string;
  method: BackupMethod;
  hasStores: boolean;
  backupPending: boolean;
  restorePending: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [bq, setBq] = useState(backupPending);
  const [rq, setRq] = useState(restorePending);

  // git-backed / not-backed-up projects have nothing to trigger
  if (method !== "agent" || !hasStores) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-1 " +
    "text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={isPending || bq}
        title="Queue a backup run for this project"
        onClick={() =>
          start(async () => {
            await triggerBackup(slug);
            setBq(true);
            router.refresh();
          })
        }
        className={btn}
      >
        <RefreshCw className={cn("size-3", isPending && "animate-spin")} />
        {bq ? "queued" : "back up"}
      </button>
      <button
        type="button"
        disabled={isPending || rq}
        title="Queue a restore test (into a throwaway container — touches nothing live)"
        onClick={() =>
          start(async () => {
            await triggerRestoreTest(slug);
            setRq(true);
            router.refresh();
          })
        }
        className={btn}
      >
        <ShieldCheck className="size-3" />
        {rq ? "queued" : "test restore"}
      </button>
    </div>
  );
}
