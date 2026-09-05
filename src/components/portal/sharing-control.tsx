"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Share2, Loader2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [taskSaving, startTaskSaving] = useTransition();

  if (portals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60">
        No client portals configured (<span className="font-mono">clients.yml</span>).
      </p>
    );
  }

  const selectedClientNames = clients.filter((c) => current.shared_with.includes(c.slug)).map((c) => c.name);
  const isShared = current.portals.length > 0;

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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
          isShared
            ? "border-emerald-500/30 bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]"
            : "border-border/60 bg-card hover:bg-accent/50",
        )}
      >
        <Share2 className={cn("size-3.5 shrink-0", isShared ? "text-emerald-400" : "text-muted-foreground")} />
        <span className={cn("font-medium", isShared ? "text-emerald-300" : "text-muted-foreground")}>
          Client portal
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
          {!isShared && <span className="text-muted-foreground/70">not shared</span>}
          {isShared &&
            current.portals.map((slug) => (
              <Badge key={slug} variant="outline" className="border-emerald-500/30 text-emerald-300">
                {portals.find((p) => p.slug === slug)?.name ?? slug}
              </Badge>
            ))}
          {isShared &&
            (selectedClientNames.length > 0 ? (
              selectedClientNames.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground/70">operator only</span>
            ))}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground">
          <Share2 className="size-3.5 text-emerald-400" /> Client portal
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Portals</p>
        {portals.map((p) => {
          const on = sel.has(p.slug);
          const portalClients = clients.filter((c) => c.portal === p.slug);
          return (
            <div key={p.slug} className={cn("rounded-md border px-2.5 py-2", on ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-border/50")}>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={on} onCheckedChange={() => togglePortal(p.slug)} />
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">{p.slug}</span>
              </label>
              {on && (
                <div className="mt-2 ml-6 space-y-1.5 border-l border-border/50 pl-3">
                  {portalClients.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      No clients in this portal yet —{" "}
                      <Link href="/settings/portals" className="text-sky-400 hover:underline">
                        invite one
                      </Link>
                      .
                    </p>
                  ) : (
                    portalClients.map((c) => (
                      <label key={c.slug} className="flex cursor-pointer items-center gap-2 text-[11px]">
                        <Checkbox checked={selClients.has(c.slug)} onCheckedChange={() => toggleClient(c.slug)} />
                        {c.name}
                        <span className="font-mono text-[10px] text-muted-foreground/50">{c.slug}</span>
                      </label>
                    ))
                  )}
                  <p className="text-[10.5px] text-muted-foreground/50">
                    With no client ticked, only the operator sees this in the portal.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {taskDefault && sel.size > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">New / unlisted tasks</p>
          <Select
            value={taskDefault.value}
            disabled={taskSaving}
            onValueChange={(mode) =>
              startTaskSaving(async () => {
                await taskDefault.onSave(mode as "all" | "none");
                router.refresh();
              })
            }
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Hidden by default — share tasks one at a time</SelectItem>
              <SelectItem value="all">Shown by default — hide specific tasks instead</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
          {saved ? "Saved" : "Save sharing"}
        </Button>
        <Link href="/settings/portals" className="text-[11px] text-muted-foreground/70 hover:text-sky-400">
          + invite a client / manage portals →
        </Link>
      </div>
    </div>
  );
}
