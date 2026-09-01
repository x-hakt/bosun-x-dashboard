import fs from "node:fs/promises";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { notesFile } from "./paths";
import { NotesFileSchema, type Note } from "./notes-schema";

export async function loadNotesFile(): Promise<{ seq: number; notes: Note[] }> {
  let raw: string;
  try {
    raw = await fs.readFile(notesFile(), "utf-8");
  } catch {
    return { seq: 0, notes: [] };
  }
  const parsed = NotesFileSchema.safeParse(loadYaml(raw));
  if (!parsed.success) return { seq: 0, notes: [] };
  // Defend against a hand-edited file whose seq fell behind the numbers in use.
  const maxNum = parsed.data.notes.reduce((max, note) => Math.max(max, note.num ?? 0), 0);
  return { seq: Math.max(parsed.data.seq, maxNum), notes: parsed.data.notes };
}

export async function loadNotes(): Promise<Note[]> {
  return (await loadNotesFile()).notes;
}

export async function saveNotes(notes: Note[], seq: number): Promise<void> {
  await fs.writeFile(notesFile(), dumpYaml({ seq, notes }), "utf-8");
}
