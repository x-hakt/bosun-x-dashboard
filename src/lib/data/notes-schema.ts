import { z } from "zod";

// A note is a task without the "get it done" machinery: something to remember or come
// back to. Same file shape as tasks.yml (a `seq` counter + a list), no status, no
// dependencies, no sub-notes. The `body` renders as the same conversation thread a task
// description does, so a note can accrete over time.
export const NoteSchema = z.object({
  id: z.string(),
  num: z.number().int().positive().nullish(),
  title: z.string(),
  body: z.string().nullish(),
  tags: z.array(z.string()).optional().default([]),
  pinned: z.boolean().optional().default(false),
  // Client portal (CGB-2.1) — same two gates as project.yml / planning tasks.
  portals: z.array(z.string()).nullish(),
  shared_with: z.array(z.string()).nullish(),
  created: z.string(),
  updated: z.string(),
});

export const NotesFileSchema = z.object({
  seq: z.number().int().nonnegative().optional().default(0),
  notes: z.array(NoteSchema),
});

export type Note = z.infer<typeof NoteSchema>;
export type NotesFile = z.infer<typeof NotesFileSchema>;
