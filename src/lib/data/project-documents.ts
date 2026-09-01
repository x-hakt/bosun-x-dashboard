import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Project } from "@/lib/types";
import { resolveCheckTarget } from "@/lib/checks/target";
import { cached } from "@/lib/util/ttl-cache";
import { loadConfig } from "@/lib/data/config";

const execFileAsync = promisify(execFile);
const sshConfigPath = () => loadConfig().sshConfig;
const MAX_DOCUMENT_BYTES = 64 * 1024;

export type ProjectDocumentKind = "spec" | "agent";

function candidates(kind: ProjectDocumentKind): string[] {
  return kind === "spec" ? ["SPEC.md"] : ["AGENTS.md", "CLAUDE.md"];
}

async function readBounded(file: string): Promise<string> {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const suffix = bytesRead > MAX_DOCUMENT_BYTES ? "\n\n> Document truncated at 64 KiB by bosun-x." : "";
    return buffer.subarray(0, Math.min(bytesRead, MAX_DOCUMENT_BYTES)).toString("utf8") + suffix;
  } finally {
    await handle.close();
  }
}

async function readLocal(projectPath: string, kind: ProjectDocumentKind) {
  for (const filename of candidates(kind)) {
    const file = path.join(projectPath, filename);
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      return { filename, content: await readBounded(file) };
    } catch {
      // Try the next exact filename.
    }
  }
  return null;
}

async function readRemote(sshAlias: string, projectPath: string, kind: ProjectDocumentKind) {
  for (const filename of candidates(kind)) {
    try {
      const { stdout } = await execFileAsync(
        "ssh",
        ["-F", sshConfigPath(), "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshAlias, `doc:${projectPath}:${filename}`],
        { timeout: 10_000, maxBuffer: MAX_DOCUMENT_BYTES + 4096 },
      );
      if (!stdout.startsWith("===DOCUMENT===\n")) continue;
      return { filename, content: stdout.slice("===DOCUMENT===\n".length, MAX_DOCUMENT_BYTES + 17) };
    } catch {
      // Missing, rejected, or unreachable: try the next exact filename.
    }
  }
  return null;
}

export async function readProjectDocument(project: Project, kind: ProjectDocumentKind) {
  const target = await resolveCheckTarget(project);
  const key = `project-doc:${project.meta.slug}:${kind}`;
  return cached(key, 5 * 60_000, async () => {
    if (target.mode === "local") return readLocal(target.path, kind);
    if (target.mode === "remote") return readRemote(target.sshAlias, target.path, kind);
    return null;
  });
}
