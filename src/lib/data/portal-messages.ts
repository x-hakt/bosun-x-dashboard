import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { z } from "zod";
import { portalMessagesDir } from "./paths";
import { countClientReplies } from "@/lib/notes-thread";

// CGB-10: one always-on client<->operator conversation per client — separate
// from the per-project/idea/task threads. Same directory shape as planning
// (task.yml + NOTES.md): DATA_DIR/portal-messages/<client-slug>/{meta.yml,NOTES.md}.

const MetaSchema = z.object({
  // How many client turns the operator has marked reviewed — same pattern as
  // client_replies_seen on tasks/planning (CGB-6/CGB-8).
  operator_seen: z.number().int().nonnegative().nullish(),
});

function threadDir(clientSlug: string): string {
  return path.join(portalMessagesDir(), clientSlug);
}
function notesFile(clientSlug: string): string {
  return path.join(threadDir(clientSlug), "NOTES.md");
}
function metaFile(clientSlug: string): string {
  return path.join(threadDir(clientSlug), "meta.yml");
}

export interface ClientMessageThread {
  slug: string;
  notes: string;
  operatorSeen: number;
  /** NOTES.md mtime, ISO — the CGB-9 digest's proxy for "a message arrived". */
  updatedAt?: string;
}

export async function readClientThread(clientSlug: string): Promise<ClientMessageThread> {
  const notes = await fs.readFile(notesFile(clientSlug), "utf-8").catch(() => "");
  const updatedAt = await fs
    .stat(notesFile(clientSlug))
    .then((s) => s.mtime.toISOString())
    .catch(() => undefined);
  let operatorSeen = 0;
  try {
    const parsed = MetaSchema.safeParse(loadYaml(await fs.readFile(metaFile(clientSlug), "utf-8")));
    if (parsed.success) operatorSeen = parsed.data.operator_seen ?? 0;
  } catch {
    // no meta.yml yet — nothing reviewed
  }
  return { slug: clientSlug, notes, operatorSeen, updatedAt };
}

export async function listClientThreads(clientSlugs: string[]): Promise<ClientMessageThread[]> {
  return Promise.all(clientSlugs.map(readClientThread));
}

// Full-document overwrite — matches how NotesThread's onSave always hands back
// the whole field, not a diff. Marking reviewed happens here too: saving the
// thread (an "Add note" reply or an edit) implies the operator has read it.
export async function saveClientThreadNotes(clientSlug: string, content: string): Promise<void> {
  await fs.mkdir(threadDir(clientSlug), { recursive: true });
  await fs.writeFile(notesFile(clientSlug), content, "utf-8");
  await writeOperatorSeen(clientSlug, countClientReplies(content));
}

// The client's write path (via reply.ts) appends one turn without touching the
// operator's seen count — a client message should surface as unread.
export async function appendClientThreadTurn(clientSlug: string, card: string): Promise<void> {
  await fs.mkdir(threadDir(clientSlug), { recursive: true });
  const current = await fs.readFile(notesFile(clientSlug), "utf-8").catch(() => "");
  await fs.writeFile(notesFile(clientSlug), current + card, "utf-8");
}

async function writeOperatorSeen(clientSlug: string, seen: number): Promise<void> {
  await fs.mkdir(threadDir(clientSlug), { recursive: true });
  await fs.writeFile(metaFile(clientSlug), dumpYaml({ operator_seen: seen }), "utf-8");
}

export async function markClientThreadReviewed(clientSlug: string): Promise<void> {
  const thread = await readClientThread(clientSlug);
  await writeOperatorSeen(clientSlug, countClientReplies(thread.notes));
}

export function unseenClientMessages(thread: ClientMessageThread): number {
  return Math.max(0, countClientReplies(thread.notes) - thread.operatorSeen);
}

export async function unseenClientMessageTotal(clientSlugs: string[]): Promise<number> {
  const threads = await listClientThreads(clientSlugs);
  return threads.reduce((total, t) => total + unseenClientMessages(t), 0);
}
