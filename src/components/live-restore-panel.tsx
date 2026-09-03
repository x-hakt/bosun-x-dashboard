"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import type { BackupsConfig } from "@/lib/types";
import type { LiveRestoreReceipt } from "@/lib/data/backup-log";
import { triggerLiveRestore } from "@/lib/actions/backups";
import { useRefreshUntil } from "@/lib/hooks/use-refresh-until";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  const h = Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000);
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// CR-38 — the "restore into the live database" control. Collapsed by default,
// type-to-confirm, and the agent always takes a pre-restore dump first so it's
// reversible. Postgres container stores only.
export function LiveRestorePanel({
  slug,
  config,
  pending,
  receipts,
}: {
  slug: string;
  config: BackupsConfig;
  pending: boolean;
  receipts: Record<string, LiveRestoreReceipt | null>;
}) {
  const eligible = config.stores.filter((s) => s.kind === "postgres" && s.container);
  const manual = config.stores.filter((s) => s.kind === "postgres" && !s.container);
  if (eligible.length === 0 && manual.length === 0) return null;

  return (
    <details className="rounded-md border border-red-500/30 bg-red-500/[0.03] mt-1 group">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-mono text-red-300/80 hover:text-red-200 inline-flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" />
        restore into the live database
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Overwrites the live database with a backup. The agent takes a fresh <span className="font-mono">pre-restore</span>{" "}
          dump first — that dump is the undo. Nothing else is affected.
        </p>
        {eligible.map((s) => (
          <StoreRestore key={s.name} slug={slug} store={s.name} pending={pending} receipt={receipts[s.name] ?? null} />
        ))}
        {manual.map((s) => (
          <p key={s.name} className="text-[11px] text-muted-foreground/70 font-mono">
            {s.name}: remote store — restore is manual, see <span className="font-mono">docs/restore.md</span>
          </p>
        ))}
      </div>
    </details>
  );
}

function StoreRestore({
  slug,
  store,
  pending,
  receipt,
}: {
  slug: string;
  store: string;
  pending: boolean;
  receipt: LiveRestoreReceipt | null;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [confirm, setConfirm] = useState("");
  const [source, setSource] = useState<"latest" | "undo" | "custom">("latest");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const watch = useRefreshUntil(pending);

  const archive =
    source === "latest" ? "latest" : source === "undo" ? (receipt?.preRestoreDump ?? "") : custom.trim();
  const armed = confirm === slug && archive.length > 0 && !isPending && !pending && !watch.watching;

  return (
    <div className="rounded border border-border/50 bg-card/40 p-2.5 space-y-2">
      <div className="font-mono text-xs">
        {store}
        {receipt && (
          <span className={cn("ml-2 text-[11px]", receipt.ok ? "text-muted-foreground" : STATUS_TEXT_CLASS.down)}>
            {receipt.ok
              ? `· last restored ${fmtWhen(receipt.restoredAt)} · ${receipt.tablesAfter ?? "?"} tables`
              : `· last restore FAILED${receipt.error ? `: ${receipt.error}` : ""}`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label className="inline-flex items-center gap-1">
          <input type="radio" checked={source === "latest"} onChange={() => setSource("latest")} />
          newest backup
        </label>
        {receipt?.preRestoreDump && (
          <label className="inline-flex items-center gap-1" title={receipt.preRestoreDump}>
            <input type="radio" checked={source === "undo"} onChange={() => setSource("undo")} />
            <RotateCcw className="size-3" /> undo last restore
          </label>
        )}
        <label className="inline-flex items-center gap-1">
          <input type="radio" checked={source === "custom"} onChange={() => setSource("custom")} />
          archive:
        </label>
        {source === "custom" && (
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="exact filename on the destination"
            className="flex-1 min-w-[12rem] rounded border border-border/60 bg-background px-2 py-1 font-mono text-[11px]"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={`type "${slug}" to confirm`}
          className="rounded border border-red-500/40 bg-background px-2 py-1 font-mono text-[11px] w-48"
        />
        <button
          type="button"
          disabled={!armed}
          onClick={() =>
            start(async () => {
              setError(null);
              watch.start();
              try {
                await triggerLiveRestore(slug, confirm, store, archive);
                setConfirm("");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "failed");
              }
            })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-mono",
            armed
              ? "border-red-500/60 text-red-200 hover:bg-red-500/10"
              : "border-border/50 text-muted-foreground/50",
          )}
        >
          {isPending || watch.watching ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3" />}
          {watch.watching ? "restoring…" : pending ? "queued" : "restore into live DB"}
        </button>
        {watch.watching && (
          <span className="text-[11px] text-muted-foreground">agent runs it within ~2 min · this updates itself</span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
