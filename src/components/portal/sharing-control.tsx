"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Share2, Loader2, Check } from "lucide-react";
import { setProjectSharing, setPlanningSharing, setNoteSharing } from "@/lib/actions/portal-sharing";
import { cn } from "@/lib/utils";

interface PortalOpt {
  slug: string;
  name: string;
}
interface ClientOpt {
  slug: string;
  name: string;
  portal: string;
}

// Operator control: which client portal(s) this project / idea / note is exposed
// to (Gate 1) and which clients within them may see it (Gate 2). Writes the two
// array fields via a server action that validates against clients.yml.
export function SharingControl({
  kind,
  id,
  portals,
  clients,
  current,
  taskDefault,
}: {
  kind: "project" | "planning" | "note";
  id: string;
  portals: PortalOpt[];
  clients: ClientOpt[];
  current: { portals: string[]; shared_with: string[] };
  /** Project-only (CGB-14): the "new/unlisted tasks default to…" control, shown
   * inside this same panel so task-sharing settings live in one place. */
  taskDefault?: { value: "all" | "none"; onSave: (mode: "all" | "none") => Promise<void> };
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set(current.portals));
  const [selClients, setSelClients] = useState(new Set(current.shared_with));
  const [saved, setSaved] = useState(false);
  const [taskMode, setTaskMode] = useState(taskDefault?.value ?? "none");
  const [taskSaving, startTaskSaving] = useTransition();

  if (portals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60">
        No client portals configured (<span className="font-mono">clients.yml</span>).
      </p>
    );
  }

  const summary =
    current.portals.length === 0
      ? "Client portal: not shared"
      : `Client portal: ${current.portals.join(", ")}${current.shared_with.length ? ` · ${current.shared_with.length} client${current.shared_with.length === 1 ? "" : "s"}` : " · operator only"}`;

  const togglePortal = (slug: string) => {
    setSaved(false);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        // drop clients of a de-selected portal
        setSelClients((pc) => {
          const n = new Set(pc);
          for (const c of clients) if (c.portal === slug) n.delete(c.slug);
          return n;
        });
      } else next.add(slug);
      return next;
    });
  };

  const toggleClient = (slug: string) => {
    setSaved(false);
    setSelClients((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const input = { portals: [...sel], shared_with: [...selClients] };
      if (kind === "project") await setProjectSharing(id, input);
      else if (kind === "planning") await setPlanningSharing(id, input);
      else await setNoteSharing(id, input);
      setSaved(true);
      router.refresh();
    });

  const isShared = current.portals.length > 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-mono transition-colors",
          isShared
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
            : "border-border/60 bg-card hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Share2 className="size-3.5 shrink-0" />
        {summary}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-card/50 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
          <Share2 className="size-3.5" /> client portal
        </span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          close
        </button>
      </div>

      <ul className="space-y-1.5">
        {portals.map((p) => {
          const on = sel.has(p.slug);
          const portalClients = clients.filter((c) => c.portal === p.slug);
          return (
            <li key={p.slug}>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={on} onChange={() => togglePortal(p.slug)} />
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-muted-foreground/50">{p.slug}</span>
              </label>
              {on && (
                <div className="ml-5 mt-1 space-y-1">
                  {portalClients.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/60">
                      no clients in this portal yet —{" "}
                      <Link href="/settings/portals" className="text-sky-400 hover:underline">
                        invite one
                      </Link>
                    </span>
                  ) : (
                    portalClients.map((c) => (
                      <label key={c.slug} className="flex items-center gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={selClients.has(c.slug)}
                          onChange={() => toggleClient(c.slug)}
                        />
                        {c.name} <span className="font-mono text-muted-foreground/50">{c.slug}</span>
                      </label>
                    ))
                  )}
                  <p className="text-[11px] text-muted-foreground/50">
                    with no client ticked, only the operator sees it in the portal
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {taskDefault && sel.size > 0 && (
        <div className="space-y-1 border-t border-border/50 pt-2">
          <label htmlFor="task-sharing-default" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            New / unlisted tasks
          </label>
          <select
            id="task-sharing-default"
            value={taskMode}
            disabled={taskSaving}
            onChange={(e) => {
              const mode = e.target.value as "all" | "none";
              setTaskMode(mode);
              startTaskSaving(async () => {
                await taskDefault.onSave(mode);
                router.refresh();
              });
            }}
            className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring dark:bg-input/30"
          >
            <option value="none">Hidden by default — share tasks one at a time</option>
            <option value="all">Shown by default — hide specific tasks instead</option>
          </select>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs font-mono",
          "hover:text-foreground disabled:opacity-50",
        )}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
        {saved ? "saved" : "save sharing"}
      </button>

      <Link href="/settings/portals" className="block text-[11px] text-muted-foreground/60 hover:text-sky-400">
        + invite a new client / manage portals →
      </Link>
    </div>
  );
}
