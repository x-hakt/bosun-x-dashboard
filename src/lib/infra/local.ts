import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cached } from "@/lib/util/ttl-cache";
import { parseSnapshot, type RemoteSnapshot } from "./remote";
import { LOCAL_SNAPSHOT_SCRIPT } from "./snapshot-sections.mjs";

const execFileAsync = promisify(execFile);

// The command sequence (and why its DISK line differs from the remote script) lives in
// snapshot-sections.mjs, shared with the host-side capacity sampler (BXD-62).
async function fetchLocalSnapshot(): Promise<RemoteSnapshot> {
  try {
    const { stdout } = await execFileAsync("sh", ["-c", LOCAL_SNAPSHOT_SCRIPT], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    return parseSnapshot(stdout);
  } catch {
    return { containers: [], specs: null, usage: null, stats: new Map() };
  }
}

// 15s: this is where the app itself runs, so this can afford to feel more live than
// the remote hosts' 30s (no network round-trip cost to amortize).
export async function getLocalSnapshot(): Promise<RemoteSnapshot> {
  return cached("local:snapshot", 15_000, fetchLocalSnapshot);
}
