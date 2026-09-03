"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Minus, Clock, Lock, RefreshCw, ShieldCheck, ShieldAlert, ChevronDown } from "lucide-react";
import type { BackupStatus, BackupRestoreStatus, BackupsConfig } from "@/lib/types";
import type { BackupLogEntry, RestoreLogEntry, LiveRestoreReceipt } from "@/lib/data/backup-log";
import { triggerBackup, triggerRestoreTest } from "@/lib/actions/backups";
import { BackupConfigEditor } from "@/components/backup-config-editor";
import { LiveRestorePanel } from "@/components/live-restore-panel";
import { useRefreshUntil } from "@/lib/hooks/use-refresh-until";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

function fmtBytes(n?: number) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function fmtAge(h?: number) {
  if (h === undefined) return "never";
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  const h = Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000);
  return fmtAge(h);
}

function restoreDetail(r: { kind?: string; tables?: number; rows?: number }) {
  return r.kind === "postgres"
    ? `${r.tables ?? 0} tables${r.rows ? `, ${r.rows.toLocaleString()} rows` : ""}`
    : `${r.rows ?? 0} files`;
}

function RestoreLine({ r }: { r: BackupRestoreStatus | null }) {
  if (!r) {
    return (
      <span className="block text-xs text-muted-foreground/70">
        <ShieldAlert className="inline size-3 mr-1" />restore: not verified yet
      </span>
    );
  }
  if (!r.ok) {
    return (
      <span className={cn("block text-xs", STATUS_TEXT_CLASS.down)}>
        <ShieldAlert className="inline size-3 mr-1" />
        restore FAILED{r.error ? `: ${r.error}` : ""}
      </span>
    );
  }
  return (
    <span className={cn("block text-xs", r.stale ? STATUS_TEXT_CLASS.attention : "text-muted-foreground")}>
      <ShieldCheck className="inline size-3 mr-1" />
      restore verified {fmtAge(r.ageHours)} · {restoreDetail(r)}
      {r.stale && " · overdue"}
      {!r.checksumOk && " · checksum unchecked"}
    </span>
  );
}

// Expandable per-store run history — backup runs and restore tests, most recent
// first, straight from the agents' *.jsonl logs.
function StoreHistory({ backups, restores }: { backups: BackupLogEntry[]; restores: RestoreLogEntry[] }) {
  if (backups.length === 0 && restores.length === 0) return null;
  return (
    <details className="mt-1 group">
      <summary className="cursor-pointer list-none text-[11px] font-mono text-muted-foreground/60 hover:text-foreground inline-flex items-center gap-1">
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
        run history
      </summary>
      <div className="mt-1.5 space-y-2 border-l border-border/40 pl-2.5">
        {restores.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/50">restore tests</p>
            <ul className="mt-0.5 space-y-0.5">
              {restores.map((r, i) => (
                <li key={i} className="text-[11px] font-mono flex items-start gap-1.5">
                  {r.ok ? (
                    <Check className={cn("size-3 shrink-0 mt-0.5", STATUS_TEXT_CLASS.up)} />
                  ) : (
                    <X className={cn("size-3 shrink-0 mt-0.5", STATUS_TEXT_CLASS.down)} />
                  )}
                  <span className="text-muted-foreground">
                    {fmtWhen(r.testedAt)} ·{" "}
                    {r.ok ? (
                      <>
                        {restoreDetail(r)}
                        {r.checksumOk ? " · checksum ok" : " · checksum unchecked"}
                      </>
                    ) : (
                      <span className={STATUS_TEXT_CLASS.down}>FAILED{r.error ? `: ${r.error}` : ""}</span>
                    )}
                    {r.archive && (
                      <span className="block text-muted-foreground/40 break-all">{r.archive.split("/").pop()}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {backups.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/50">backups</p>
            <ul className="mt-0.5 space-y-0.5">
              {backups.map((b, i) => (
                <li key={i} className="text-[11px] font-mono flex items-start gap-1.5">
                  {b.ok ? (
                    <Check className={cn("size-3 shrink-0 mt-0.5", STATUS_TEXT_CLASS.up)} />
                  ) : (
                    <X className={cn("size-3 shrink-0 mt-0.5", STATUS_TEXT_CLASS.down)} />
                  )}
                  <span className="text-muted-foreground">
                    {fmtWhen(b.finishedAt)}
                    {b.ok
                      ? ` · ${fmtBytes(b.bytes) || "ok"}`
                      : ` · `}
                    {!b.ok && <span className={STATUS_TEXT_CLASS.down}>FAILED{b.error ? `: ${b.error}` : ""}</span>}
                    {b.archive && (
                      <span className="block text-muted-foreground/40 break-all">{b.archive.split("/").pop()}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function ProjectBackups({
  status,
  pending,
  restorePending,
  config,
  destinations = [],
  backupLog = [],
  restoreLog = {},
  liveRestorePending = false,
  liveRestoreReceipts = {},
}: {
  status: BackupStatus;
  pending: boolean;
  restorePending?: boolean;
  config?: BackupsConfig | null;
  destinations?: { id: string; kind: string }[];
  backupLog?: BackupLogEntry[];
  restoreLog?: Record<string, RestoreLogEntry[]>;
  liveRestorePending?: boolean;
  liveRestoreReceipts?: Record<string, LiveRestoreReceipt | null>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const backup = useRefreshUntil(pending);
  const restore = useRefreshUntil(Boolean(restorePending));

  if (status.method === "git") {
    return (
      <p className="text-sm text-muted-foreground">
        Backed up by its git remote — no separate dump needed.
        {status.notes && <span className="block text-xs mt-1">{status.notes}</span>}
      </p>
    );
  }
  if (status.method === "none" || !status.required) {
    return <p className="text-sm text-muted-foreground">Not backed up (deliberate).</p>;
  }

  const backupBusy = isPending || pending || backup.watching;
  const restoreBusy = isPending || Boolean(restorePending) || restore.watching;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/50 text-sm">
        {status.stores.map((s) => {
          const icon = s.ok === false ? { Icon: X, c: STATUS_TEXT_CLASS.down }
            : s.ok === null ? { Icon: Minus, c: STATUS_TEXT_CLASS.unknown }
            : s.stale ? { Icon: Clock, c: STATUS_TEXT_CLASS.attention }
            : { Icon: Check, c: STATUS_TEXT_CLASS.up };
          return (
            <li key={s.name} className="flex items-start gap-2.5 py-1.5">
              <icon.Icon className={cn("size-4 shrink-0 mt-0.5", icon.c)} />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs">{s.name}</span>
                {s.encrypted && <Lock className="inline size-3 ml-1 text-muted-foreground" />}
                <span className="block text-xs text-muted-foreground">
                  {s.ok === false
                    ? `failed${s.error ? `: ${s.error}` : ""}`
                    : s.ok === null
                      ? "no run recorded yet"
                      : `${fmtAge(s.ageHours)}${s.bytes ? ` · ${fmtBytes(s.bytes)}` : ""}${s.stale ? " · stale" : ""}`}
                </span>
                <RestoreLine r={s.restore} />
                <StoreHistory
                  backups={backupLog.filter((b) => b.store === s.name)}
                  restores={restoreLog[s.name] ?? []}
                />
              </span>
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-muted-foreground/50">{s.kind}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={backupBusy}
          onClick={() =>
            startTransition(async () => {
              backup.start();
              await triggerBackup(status.slug);
              router.refresh();
            })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1",
            "text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("size-3.5", backupBusy && "animate-spin")} />
          {backup.watching ? "backing up…" : pending ? "queued" : "run backup now"}
        </button>
        <button
          type="button"
          disabled={restoreBusy}
          onClick={() =>
            startTransition(async () => {
              restore.start();
              await triggerRestoreTest(status.slug);
              router.refresh();
            })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1",
            "text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50",
          )}
        >
          <ShieldCheck className={cn("size-3.5", restoreBusy && "animate-spin")} />
          {restore.watching ? "testing…" : restorePending ? "queued" : "test restore"}
        </button>
        {(backup.watching || restore.watching) ? (
          <span className="text-[11px] text-muted-foreground">
            waiting for the agent (runs within ~2 min) · this updates itself
          </span>
        ) : (pending || restorePending) ? (
          <span className="text-[11px] text-muted-foreground">queued — the agent picks this up within ~2 min</span>
        ) : status.destination ? (
          <span className="text-[11px] text-muted-foreground">→ {status.destination}</span>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground/60">
        A restore test decrypts + restores each archive into a throwaway container, then removes it —
        nothing on disk to clean up, nothing live is touched.
      </p>

      {config && config.stores.length > 0 && (
        <div className="pt-1 space-y-1">
          <BackupConfigEditor slug={status.slug} config={config} destinations={destinations} />
          <LiveRestorePanel
            slug={status.slug}
            config={config}
            pending={liveRestorePending}
            receipts={liveRestoreReceipts}
          />
        </div>
      )}
    </div>
  );
}
