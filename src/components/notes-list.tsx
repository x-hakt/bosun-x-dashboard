"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pin, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesThread } from "@/components/notes-thread";
import { createNote, deleteNote, toggleNotePin, updateNote } from "@/lib/actions/notes";
import type { Note } from "@/lib/data/notes-schema";
import { cn } from "@/lib/utils";

function excerpt(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const clean = value
    .replace(/^\s*---.*?---\s*$/gm, "") // drop conversation-thread header lines
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

function NoteRow({ note }: { note: Note }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState((note.tags ?? []).join(", "));
  const [error, setError] = useState<string>();

  const run = (op: () => Promise<void>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await op();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Update failed");
      }
    });
  };

  return (
    <div className="group border-b border-border/50 last:border-b-0">
      <div className="flex min-h-11 items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={expanded ? `Collapse ${note.title}` : `Expand ${note.title}`}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium">{note.title}</span>
          {!expanded && excerpt(note.body) && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{excerpt(note.body)}</span>
          )}
        </button>

        {(note.tags ?? []).slice(0, 3).map((tag) => (
          <span key={tag} className="hidden shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            {tag}
          </span>
        ))}

        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => toggleNotePin(note.id))}
          title={note.pinned ? "Unpin" : "Pin to top"}
          className={cn(
            "shrink-0 rounded p-1 transition-colors hover:bg-accent",
            note.pinned ? "text-amber-400" : "text-muted-foreground/40 hover:text-foreground",
          )}
        >
          <Pin className={cn("size-3.5", note.pinned && "fill-current")} />
        </button>
      </div>

      {expanded && (
        <div className="mb-3 ml-7 space-y-4 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-title-${note.id}`}>Title</label>
            <Input id={`note-title-${note.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Note</span>
            <NotesThread
              value={note.body ?? ""}
              onSave={(next) => updateNote(note.id, { body: next })}
              editorRows={10}
              placeholder="Anything worth remembering or coming back to…"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-tags-${note.id}`}>Tags</label>
            <Input
              id={`note-tags-${note.id}`}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated"
              className="text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={isPending || !title.trim()}
              onClick={() => run(() => updateNote(note.id, { title, tags: tags.split(",") }))}
            >
              <Save className="size-3.5" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                if (window.confirm(`Delete note “${note.title}”?`)) run(() => deleteNote(note.id));
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotesList({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");

  const ordered = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updated ?? "").localeCompare(a.updated ?? "");
    });
  }, [notes]);

  const add = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    startTransition(async () => {
      await createNote(title);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New note…"
          className="text-sm"
        />
        <Button size="sm" disabled={isPending || !newTitle.trim()} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{notes.length} note{notes.length === 1 ? "" : "s"}</p>

      {ordered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60 bg-card px-3">
          {ordered.map((note) => <NoteRow key={note.id} note={note} />)}
        </div>
      )}
    </div>
  );
}
