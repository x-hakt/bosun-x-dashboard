"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { notesDir } from "@/lib/data/paths";

export async function saveInboxNote(content: string): Promise<void> {
  const dir = notesDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "inbox.md"), content, "utf-8");
}

export async function readInboxNote(): Promise<string> {
  try {
    return await fs.readFile(path.join(notesDir(), "inbox.md"), "utf-8");
  } catch {
    return "";
  }
}
