"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck } from "lucide-react";
import type { BackupMethod } from "@/lib/types";
import { triggerBackup, triggerRestoreTest } from "@/lib/actions/backups";
import { useRefreshUntil } from "@/lib/hooks/use-refresh-until";
import { cn } from "@/lib/utils";

// The per-row "back up now" / "test restore" controls on /backups. Both just
// write a request file that the host agent's --requests pass picks up within
// ~2 min — the dashboard never runs a backup or touches a container itself.
// After queueing, the row polls itself until the result lands.
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
  const backup = useRefreshUntil(backupPending);
  const restore = useRefreshUntil(restorePending);

  if (method !== "agent" || !hasStores) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-1 " +
    "text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50";

  const backupBusy = isPending || backupPending || backup.watching;
  const restoreBusy = isPending || restorePending || restore.watching;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={backupBusy}
        title="Queue a backup run for this project"
        onClick={() =>
          start(async () => {
            backup.start();
            await triggerBackup(slug);
            router.refresh();
          })
        }
        className={btn}
      >
        <RefreshCw className={cn("size-3", backupBusy && "animate-spin")} />
        {backup.watching ? "running…" : backupPending ? "queued" : "back up"}
      </button>
      <button
        type="button"
        disabled={restoreBusy}
        title="Queue a restore test (into a throwaway container — touches nothing live)"
        onClick={() =>
          start(async () => {
            restore.start();
            await triggerRestoreTest(slug);
            router.refresh();
          })
        }
        className={btn}
      >
        <ShieldCheck className={cn("size-3", restoreBusy && "animate-spin")} />
        {restore.watching ? "running…" : restorePending ? "queued" : "test restore"}
      </button>
    </div>
  );
}
