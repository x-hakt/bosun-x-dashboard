"use server";

import { randomUUID } from "node:crypto";
import { loadNotesFile, saveNotes } from "@/lib/data/notes";
import { isoTimestamp } from "@/lib/time/stamp";
import type { Note } from "@/lib/data/notes-schema";

async function mutate(fn: (state: { seq: number; notes: Note[] }) => number | void): Promise<void> {
  const state = await loadNotesFile();
  const seq = fn(state) ?? state.seq;
  await saveNotes(state.notes, seq);
}

export async function createNote(title: string): Promise<void> {
  const clean = title.trim();
  if (!clean) return;
  await mutate((state) => {
    const num = state.seq + 1;
    const now = isoTimestamp();
    state.notes.unshift({ id: randomUUID(), num, title: clean, body: "", tags: [], pinned: false, created: now, updated: now });
    return num;
  });
}

export async function updateNote(
  id: string,
  patch: { title?: string; body?: string; tags?: string[] },
): Promise<void> {
  await mutate((state) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) throw new Error("Note not found");
    if (patch.title !== undefined) note.title = patch.title.trim() || note.title;
    if (patch.body !== undefined) note.body = patch.body;
    if (patch.tags !== undefined) note.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
    note.updated = isoTimestamp();
  });
}

export async function toggleNotePin(id: string): Promise<void> {
  await mutate((state) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) throw new Error("Note not found");
    note.pinned = !note.pinned;
    note.updated = isoTimestamp();
  });
}

export async function deleteNote(id: string): Promise<void> {
  await mutate((state) => {
    state.notes = state.notes.filter((n) => n.id !== id);
  });
}
