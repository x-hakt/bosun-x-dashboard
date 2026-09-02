"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, Save, X } from "lucide-react";
import type { BackupsConfig } from "@/lib/types";
import { saveBackups, revealRestoreKey, type BackupsPatch } from "@/lib/actions/backups";

type StoreEdit = { schedule: string; keepLast: string; encrypt: boolean; recipient: string };

// CR-35 — edit the scalar knobs of backups.yml from the pane: destination,
// per-store schedule / retention / encryption. Add or remove a store still means
// editing the file (it needs a kind + a source). Comments are not preserved.
export function BackupConfigEditor({
  slug,
  config,
  destinations,
}: {
  slug: string;
  config: BackupsConfig;
  destinations: { id: string; kind: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState(config.destination ?? "");
  const [stores, setStores] = useState<Record<string, StoreEdit>>(() =>
    Object.fromEntries(
      config.stores.map((s) => [
        s.name,
        {
          schedule: s.schedule ?? "",
          keepLast: s.retention?.keep_last ? String(s.retention.keep_last) : "",
          encrypt: Boolean(s.encrypt?.age_recipient),
          recipient: s.encrypt?.age_recipient ?? "",
        },
      ]),
    ),
  );

  const setStore = (name: string, patch: Partial<StoreEdit>) =>
    setStores((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        edit backup config
      </button>
    );
  }

  const save = () =>
    startSave(async () => {
      setError(null);
      const patch: BackupsPatch = {
        destination,
        stores: Object.fromEntries(
          config.stores.map((s) => {
            const e = stores[s.name];
            return [
              s.name,
              {
                schedule: e.schedule.trim(),
                keep_last: e.keepLast.trim() ? Number(e.keepLast) : 0,
                age_recipient: e.encrypt ? e.recipient.trim() : null,
              },
            ];
          }),
        ),
      };
      try {
        await saveBackups(slug, patch);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "save failed");
      }
    });

  return (
    <div className="rounded-md border border-border/60 bg-card/50 p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">backup config</span>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Destination</span>
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono"
        >
          <option value="">(inherit / none)</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id} · {d.kind}
            </option>
          ))}
        </select>
      </label>

      <ul className="space-y-3">
        {config.stores.map((s) => {
          const e = stores[s.name];
          return (
            <li key={s.name} className="space-y-1.5 border-t border-border/40 pt-2 first:border-0 first:pt-0">
              <span className="font-mono text-xs">
                {s.name} <span className="text-muted-foreground/60">· {s.kind}</span>
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="space-y-0.5">
                  <span className="block text-[11px] text-muted-foreground">schedule</span>
                  <input
                    value={e.schedule}
                    onChange={(ev) => setStore(s.name, { schedule: ev.target.value })}
                    placeholder="nightly"
                    className="w-28 rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="block text-[11px] text-muted-foreground">keep last</span>
                  <input
                    value={e.keepLast}
                    onChange={(ev) => setStore(s.name, { keepLast: ev.target.value.replace(/[^0-9]/g, "") })}
                    inputMode="numeric"
                    placeholder="∞"
                    className="w-16 rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono"
                  />
                </label>
                <label className="flex items-end gap-1.5 pb-1">
                  <input
                    type="checkbox"
                    checked={e.encrypt}
                    onChange={(ev) => setStore(s.name, { encrypt: ev.target.checked })}
                  />
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Lock className="size-3" /> encrypt
                  </span>
                </label>
              </div>
              {e.encrypt && (
                <input
                  value={e.recipient}
                  onChange={(ev) => setStore(s.name, { recipient: ev.target.value })}
                  placeholder="age recipient (age1… — public key)"
                  className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono"
                />
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs font-mono hover:text-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          save config
        </button>
        {config.stores.some((s) => s.encrypt?.age_recipient) && <RevealKey slug={slug} />}
      </div>
    </div>
  );
}

function RevealKey({ slug }: { slug: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, start] = useTransition();

  if (key) {
    return (
      <span className="flex-1 space-y-1">
        <code className="block break-all rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200/90">
          {key}
        </code>
        <button
          type="button"
          onClick={() => setKey(null)}
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
        >
          hide restore key
        </button>
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        disabled={loading}
        onClick={() =>
          start(async () => {
            setErr(null);
            if (!window.confirm("Show the age restore key for this project? It decrypts every backup.")) return;
            try {
              setKey(await revealRestoreKey(slug));
            } catch (e) {
              setErr(e instanceof Error ? e.message : "not available");
            }
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-mono text-amber-200/80 hover:text-amber-100 disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
        reveal restore key
      </button>
      {err && <span className="ml-2 text-[11px] text-red-400">{err}</span>}
    </span>
  );
}
