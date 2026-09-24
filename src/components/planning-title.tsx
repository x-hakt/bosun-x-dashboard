"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { renamePlanningTask } from "@/lib/actions/planning";

// BXD-57: inline title editing for an idea, same interaction as ProjectTitle. Idea
// titles are often a sentence or two, so this edits in a textarea; Enter saves,
// Shift+Enter is swallowed (titles are single-line), Escape cancels.
export function PlanningTitle({ id, initialTitle }: { id: string; initialTitle: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === initialTitle) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renamePlanningTask(id, trimmed);
        setEditing(false);
        setError(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <Textarea
            autoFocus
            value={value}
            rows={2}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="text-base font-semibold min-h-0 w-full"
            disabled={isPending}
            aria-label="Idea title"
          />
          <button onClick={save} className="mt-1 text-emerald-400 hover:text-emerald-300" disabled={isPending} aria-label="Save title">
            <Check className="size-4" />
          </button>
          <button onClick={() => setEditing(false)} className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Cancel">
            <X className="size-4" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 group">
      <h1 className="text-lg font-semibold tracking-tight">{initialTitle}</h1>
      <button
        onClick={() => {
          setValue(initialTitle);
          setEditing(true);
        }}
        className="mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        aria-label="Edit title"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
