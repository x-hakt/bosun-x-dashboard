"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseNoteThread, noteTurnHeader, type NoteTurn } from "@/lib/notes-thread";
import { cn } from "@/lib/utils";

const PROSE = cn(
  "prose prose-invert prose-sm max-w-none",
  "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-sm",
  "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
  "prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline",
  "prose-code:before:content-none prose-code:after:content-none prose-code:text-[0.85em]",
  "prose-hr:my-3",
);

const COLLAPSE_OVER = 1400;

function TurnCard({ turn }: { turn: NoteTurn }) {
  const [open, setOpen] = useState(turn.body.length <= COLLAPSE_OVER);
  const roleClass =
    turn.role === "agent"
      ? "border-sky-500/25 bg-sky-500/[0.04]"
      : turn.role === "user"
        ? "border-emerald-500/30 bg-emerald-500/[0.05]"
        : turn.role === "client"
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-border/60 bg-muted/20";

  const hasHeader = Boolean(turn.author || turn.date || turn.label);

  return (
    <li className={cn("rounded-md border p-3", roleClass)}>
      {hasHeader && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          {turn.author && <span className="font-medium text-foreground">{turn.author}</span>}
          {turn.label && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                turn.role === "client"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {turn.label}
            </span>
          )}
          {turn.date && <span className="text-muted-foreground">{turn.date}</span>}
        </div>
      )}
      <div
        className={cn(
          !open && "max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
        )}
      >
        <div className={PROSE}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.body}</ReactMarkdown>
        </div>
      </div>
      {turn.body.length > COLLAPSE_OVER && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1.5 text-[11px] text-sky-400 hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </li>
  );
}

// Renders a task description / planning NOTES blob as a conversation thread, read-only,
// with one Edit toggle that swaps in the raw-markdown textarea (the field stays a single
// plain-markdown document). "Add note" appends a canonical dated header and opens the
// editor there.
export function NotesThread({
  value,
  onSave,
  authorName = "You",
  placeholder = "No notes yet.",
  editorRows = 16,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  authorName?: string;
  placeholder?: string;
  editorRows?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const turns = parseNoteThread(value);

  const commit = (text: string) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await onSave(text);
        setEditing(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Save failed");
      }
    });
  };

  const openEditor = (seed: string) => {
    setDraft(seed);
    setError(undefined);
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={editorRows}
          autoFocus
          className="font-mono text-xs leading-relaxed"
          placeholder={placeholder}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={isPending} onClick={() => commit(draft)}>
            <Check className="size-3.5" /> {isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setEditing(false)}>
            <X className="size-3.5" /> Cancel
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">
          One markdown field. Start a new turn with <code className="text-[10px]">--- {authorName} · {new Date().toISOString().slice(0, 10)} ---</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
          {turns.length === 0 ? "Notes" : `${turns.length} note${turns.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              const base = value.trimEnd();
              openEditor(`${base ? `${base}\n\n` : ""}${noteTurnHeader(authorName)}\n\n`);
            }}
          >
            <Plus className="size-3.5" /> Add note
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => openEditor(value)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </div>
      </div>

      {turns.length === 0 ? (
        <p className="py-2 text-xs italic text-muted-foreground">{placeholder}</p>
      ) : (
        <ol className="space-y-2">
          {turns.map((turn, index) => (
            <TurnCard key={index} turn={turn} />
          ))}
        </ol>
      )}
    </div>
  );
}
