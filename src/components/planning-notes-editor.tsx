"use client";

import { NotesThread } from "@/components/notes-thread";
import { savePlanningNotes } from "@/lib/actions/planning";

export function PlanningNotesEditor({ id, initialContent }: { id: string; initialContent: string }) {
  return (
    <NotesThread
      value={initialContent}
      onSave={(next) => savePlanningNotes(id, next)}
      editorRows={18}
      placeholder="Flesh out the design here as it develops…"
    />
  );
}
