import { z } from "zod";

export const TaskStatusSchema = z.enum(["backlog", "todo", "in_progress", "done"]);

export const TaskSchema = z.object({
  id: z.string(),
  // Short per-project sequence number, rendered as "<KEY>-<num>" (e.g. CR-7) so a task
  // can be named out loud. Assigned on creation from the file's `seq` counter and never
  // reused. Optional only for backward compat with pre-numbering records.
  num: z.number().int().positive().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  status: TaskStatusSchema,
  parent_id: z.string().nullish(),
  // Client portal (CGB-2.1): client slugs allowed to see this individual task in a
  // portal its project is exposed to. Absent = the client sees the task's title +
  // status (from the shared project) but not its description/thread.
  shared_with: z.array(z.string()).nullish(),
  // CGB-6/CGB-8: count of portal-client replies the operator has marked reviewed
  // on this task's thread. The UI nudges when the thread's client-reply count
  // exceeds it.
  client_replies_seen: z.number().int().nonnegative().nullish(),
  depends_on: z.array(z.string()).optional().default([]),
  created: z.string(),
  updated: z.string(),
});

export const TasksFileSchema = z.object({
  // Highest task number ever issued for this project — monotonic, never decremented,
  // so deleting a task does not free its number for reuse.
  seq: z.number().int().nonnegative().optional().default(0),
  tasks: z.array(TaskSchema),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TasksFile = z.infer<typeof TasksFileSchema>;
