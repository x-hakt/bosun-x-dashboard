"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Minus, Clock, Lock, RefreshCw } from "lucide-react";
import type { BackupStatus } from "@/lib/types";
import { triggerBackup } from "@/lib/actions/backups";
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

export function ProjectBackups({ status, pending }: { status: BackupStatus; pending: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requested, setRequested] = useState(pending);

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
              </span>
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-muted-foreground/50">{s.kind}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={isPending || requested}
          onClick={() =>
            startTransition(async () => {
              await triggerBackup(status.slug);
              setRequested(true);
              router.refresh();
            })
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1",
            "text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
          {requested ? "queued" : "run backup now"}
        </button>
        {requested && (
          <span className="text-[11px] text-muted-foreground">the agent picks this up within ~2 min</span>
        )}
        {status.destination && !requested && (
          <span className="text-[11px] text-muted-foreground">→ {status.destination}</span>
        )}
      </div>
    </div>
  );
}
