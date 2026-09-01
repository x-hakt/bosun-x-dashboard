import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cached } from "@/lib/util/ttl-cache";
import type { GitFacts } from "@/lib/types";
import { loadConfig } from "@/lib/data/config";

const execFileAsync = promisify(execFile);
const sshConfigPath = () => loadConfig().sshConfig;

export interface RemoteFacts {
  files: Record<string, boolean>;
  git: GitFacts;
}

const EMPTY_REMOTE_FACTS: RemoteFacts = { files: {}, git: { isRepo: false } };

function section(body: string, name: string): string {
  const marker = `===${name}===`;
  const start = body.indexOf(marker);
  if (start === -1) return "";
  const from = start + marker.length;
  const nextMarker = body.indexOf("===", from);
  return body.slice(from, nextMarker === -1 ? undefined : nextMarker).trim();
}

function parseKV(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

// Calls the SAME dedicated least-privilege discovery key used for server resource
// stats (see lib/infra/remote.ts) — its forced command (control-room-ro.sh, on each
// target host) was extended to a second mode: given one of an exact allowlist of known
// project paths (via $SSH_ORIGINAL_COMMAND, which sshd sets to whatever's requested
// below — the client never controls which script runs, only this one fixed argument),
// it reports file presence + basic git facts for that path instead of resource stats.
// Anything not on that allowlist gets a clean rejection, not an error — this parses
// that rejection the same as any other unreachable/failed case (empty result), never
// throwing.
// Throws on SSH/exec failure so the caller can negative-cache it briefly instead of
// pinning an empty result for the full TTL (see getRemoteFacts). A clean `===REJECTED===`
// is NOT a failure — it's a definitive "this path isn't on the allowlist" answer and is
// cached normally.
async function fetchRemoteFacts(sshAlias: string, remotePath: string): Promise<RemoteFacts> {
  const { stdout } = await execFileAsync(
    "ssh",
    ["-F", sshConfigPath(), "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", sshAlias, remotePath],
    { timeout: 12_000 },
  );
  if (stdout.includes("===REJECTED===")) return EMPTY_REMOTE_FACTS;

  const filesBlock = parseKV(section(stdout, "FILES"));
  const files: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(filesBlock)) files[k] = v === "1";

  const gitBlock = parseKV(section(stdout, "GIT"));
  const isRepo = gitBlock.is_repo === "1";
  const git: GitFacts = { isRepo };
  if (isRepo) {
    git.lastCommitDate = gitBlock.last_commit_date || undefined;
    git.lastCommitAuthor = gitBlock.last_commit_author || undefined;
    git.uncommittedCount = gitBlock.uncommitted ? Number(gitBlock.uncommitted) : undefined;
    git.hasRemote = gitBlock.remote_count !== undefined ? Number(gitBlock.remote_count) > 0 : undefined;
  }
  return { files, git };
}

// Remote repository facts cost hundreds of milliseconds and don't need to refresh on
// every click. Keep them for five minutes; in-flight cache deduplication also ensures
// standards and computed-facts share one SSH request when the entry does expire.
export async function getRemoteFacts(sshAlias: string, remotePath: string): Promise<RemoteFacts> {
  try {
    return await cached(
      `remote-facts:${sshAlias}:${remotePath}`,
      5 * 60_000,
      () => fetchRemoteFacts(sshAlias, remotePath),
      { negativeTtlMs: 30_000 },
    );
  } catch {
    // Unchanged contract: an unreachable host yields empty facts, not an exception —
    // just remembered for 30s rather than 5 minutes.
    return EMPTY_REMOTE_FACTS;
  }
}
