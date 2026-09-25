import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cached } from "@/lib/util/ttl-cache";
import { parseSnapshot, type RemoteSnapshot } from "./remote";
import { LOCAL_SNAPSHOT_SCRIPT } from "./snapshot-sections.mjs";

const execFileAsync = promisify(execFile);

const PLATFORM_NAMES: Partial<Record<NodeJS.Platform, string>> = { darwin: "macOS", win32: "Windows", freebsd: "FreeBSD" };

// BXD-72: memory, disk and load come from Linux tools (free, df -B1, /proc/loadavg), so on
// any other OS they're missing by design. Say so instead of showing bare dashes. Docker
// (containers, per-container stats) works anywhere the docker CLI does.
export function hostStatsNote(platform: NodeJS.Platform = process.platform): string | undefined {
  if (platform === "linux") return undefined;
  return `Memory, disk and load need a Linux host; not read on ${PLATFORM_NAMES[platform] ?? platform}. Containers still show.`;
}

// The command sequence (and why its DISK line differs from the remote script) lives in
// snapshot-sections.mjs, shared with the host-side capacity sampler (BXD-62).
async function fetchLocalSnapshot(): Promise<RemoteSnapshot> {
  const statsNote = hostStatsNote();
  try {
    const { stdout } = await execFileAsync("sh", ["-c", LOCAL_SNAPSHOT_SCRIPT], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    const snapshot = parseSnapshot(stdout);
    // Half-parsed Linux output from another OS (say a cores count of 0) is worse than none.
    return statsNote ? { ...snapshot, usage: null, specs: snapshot.specs && { ...snapshot.specs, cores: 0 }, statsNote } : snapshot;
  } catch {
    return { containers: [], specs: null, usage: null, stats: new Map(), statsNote };
  }
}

// 15s: this is where the app itself runs, so this can afford to feel more live than
// the remote hosts' 30s (no network round-trip cost to amortize).
export async function getLocalSnapshot(): Promise<RemoteSnapshot> {
  return cached("local:snapshot", 15_000, fetchLocalSnapshot);
}
