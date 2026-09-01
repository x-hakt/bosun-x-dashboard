import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ContainerSummary } from "./docker";
import { cached } from "@/lib/util/ttl-cache";
import { loadConfig } from "@/lib/data/config";

const execFileAsync = promisify(execFile);

interface DockerPsLine {
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Labels: string;
}

interface DockerStatsLine {
  Name: string;
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
}

export interface RemoteSpecs {
  kernel: string;
  cores: number;
}

export interface RemoteUsage {
  memTotalBytes: number;
  memUsedBytes: number;
  memAvailBytes: number;
  diskSizeBytes: number;
  diskUsedBytes: number;
  diskAvailBytes: number;
  diskUsePercent: number;
  loadAvg1: number;
}

export interface RemoteContainerStat {
  cpuPercent: number;
  memUsage: string;
  memPercent: number;
}

export interface RemoteSnapshot {
  containers: ContainerSummary[];
  specs: RemoteSpecs | null;
  usage: RemoteUsage | null;
  stats: Map<string, RemoteContainerStat>;
}

const EMPTY_SNAPSHOT: RemoteSnapshot = { containers: [], specs: null, usage: null, stats: new Map() };

function extractLabel(labels: string, key: string): string | undefined {
  // Labels come back as a single "k=v,k=v,..." string. Some values (e.g. depends_on)
  // contain commas themselves, so a blind split(',') would corrupt those — but the
  // three keys we actually read (project/service/working_dir) never do, so a direct
  // regex lookup for just those keys is safe without parsing the whole string.
  const match = new RegExp(`(?:^|,)${key.replace(/\./g, "\\.")}=([^,]*)`).exec(labels);
  return match?.[1];
}

function section(body: string, name: string): string {
  const marker = `===${name}===`;
  const start = body.indexOf(marker);
  if (start === -1) return "";
  const from = start + marker.length;
  const nextMarker = body.indexOf("===", from);
  return body.slice(from, nextMarker === -1 ? undefined : nextMarker).trim();
}

function parseContainers(block: string): ContainerSummary[] {
  return block
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const parsed = JSON.parse(line) as DockerPsLine;
      const healthMatch = parsed.State === "running" ? /\(([^)]+)\)/.exec(parsed.Status) : null;
      const health = healthMatch && /healthy|starting/i.test(healthMatch[1]) ? healthMatch[1] : undefined;
      return {
        id: parsed.Names,
        name: parsed.Names,
        image: parsed.Image,
        state: parsed.State,
        status: parsed.Status,
        health,
        composeProject:
          extractLabel(parsed.Labels, "com.docker.compose.project") ??
          extractLabel(parsed.Labels, "io.podman.compose.project"),
        composeService:
          extractLabel(parsed.Labels, "com.docker.compose.service") ??
          extractLabel(parsed.Labels, "io.podman.compose.service"),
        composeWorkingDir: extractLabel(parsed.Labels, "com.docker.compose.project.working_dir"),
      };
    });
}

function parseStats(block: string): Map<string, RemoteContainerStat> {
  const stats = new Map<string, RemoteContainerStat>();
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as DockerStatsLine;
      stats.set(parsed.Name, {
        cpuPercent: Number.parseFloat(parsed.CPUPerc) || 0,
        memUsage: parsed.MemUsage,
        memPercent: Number.parseFloat(parsed.MemPerc) || 0,
      });
    } catch {
      // one malformed stats line shouldn't take down the rest
    }
  }
  return stats;
}

// Exported so local.ts (the local host's own specs/usage, no SSH involved) can feed the exact
// same section-tagged shell output through one shared parser instead of duplicating it.
export function parseSnapshot(raw: string): RemoteSnapshot {
  const uname = section(raw, "UNAME"); // "Linux 5.15.152-1-pve x86_64"
  const nproc = Number.parseInt(section(raw, "NPROC"), 10);
  const specs: RemoteSpecs | null = uname ? { kernel: uname, cores: Number.isFinite(nproc) ? nproc : 0 } : null;

  const meminfo = section(raw, "MEMINFO"); // `free -b` output
  const memLine = meminfo.split("\n").find((l) => l.startsWith("Mem:"));
  const memParts = memLine?.trim().split(/\s+/) ?? [];
  // free -b: Mem: total used free shared buff/cache available
  const memTotalBytes = Number(memParts[1]) || 0;
  const memAvailBytes = Number(memParts[6]) || 0;
  const memUsedBytes = memTotalBytes && memAvailBytes ? memTotalBytes - memAvailBytes : Number(memParts[2]) || 0;

  const diskLine = section(raw, "DISK"); // "size used avail pcent%"
  const diskParts = diskLine.trim().split(/\s+/);
  const diskSizeBytes = Number(diskParts[0]) || 0;
  const diskUsedBytes = Number(diskParts[1]) || 0;
  const diskAvailBytes = Number(diskParts[2]) || 0;
  const diskUsePercent = Number.parseInt(diskParts[3] ?? "0", 10) || 0;

  const loadLine = section(raw, "LOAD"); // "/proc/loadavg" — "0.12 0.08 0.05 1/370 3574090"
  const loadAvg1 = Number.parseFloat(loadLine.split(/\s+/)[0]) || 0;

  const usage: RemoteUsage | null = meminfo
    ? { memTotalBytes, memUsedBytes, memAvailBytes, diskSizeBytes, diskUsedBytes, diskAvailBytes, diskUsePercent, loadAvg1 }
    : null;

  return {
    containers: parseContainers(section(raw, "DOCKER_PS")),
    specs,
    usage,
    stats: parseStats(section(raw, "DOCKER_STATS")),
  };
}

const sshConfigPath = () => loadConfig().sshConfig;

// Polls a remote host over SSH using a DEDICATED, least-privilege discovery key — not
// your own admin ~/.ssh. Each target host's authorized_keys forces this key to run
// ONLY /usr/local/bin/control-room-ro.sh (no shell, no pty, no port-forwarding except
// the one narrow exception needed for a jump hop, scoped via permitopen
// to that single destination) — the client's requested command below is irrelevant,
// sshd always runs the forced command instead; kept descriptive for anyone reading logs.
// That script is a fixed sequence of read-only commands (uname, nproc, free, df, load,
// docker ps, docker stats) — see the script itself on each host for the exact contents.
// Verified the lockdown after switching the forced command over (arbitrary commands
// ignored, pty rejected, port-forwarding rejected except the one permitted destination —
// confirmed by actually relaying an SSH banner through the permitted tunnel and
// confirming zero bytes through every disallowed one) before wiring this in.
// Throws on SSH/exec failure (unreachable, timeout, non-zero exit) — the caller turns
// that into a SHORT-lived negative cache entry rather than pinning an empty result for
// the full TTL. A slow `docker stats` on a loaded remote host is the common cause, and
// it clears on its own within seconds; a 5-minute stale-empty was not acceptable.
async function fetchRemoteSnapshot(sshAlias: string, timeoutMs: number): Promise<RemoteSnapshot> {
  const { stdout } = await execFileAsync(
    "ssh",
    [
      "-F", sshConfigPath(),
      "-o", "BatchMode=yes",
      "-o", `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
      sshAlias,
      "control-room-ro",
    ],
    { timeout: timeoutMs + 4000, maxBuffer: 8 * 1024 * 1024 },
  );
  return parseSnapshot(stdout);
}

// Remote snapshots cost 2.4-2.9s in measured production calls. Five minutes keeps
// ordinary navigation instant; this dashboard is an overview, not a realtime alerting
// system, and an explicit refresh control can be added later if sub-minute freshness is needed.
export async function getRemoteSnapshot(sshAlias: string, timeoutMs = 12_000): Promise<RemoteSnapshot> {
  try {
    return await cached(
      `remote:snapshot:${sshAlias}`,
      5 * 60_000,
      () => fetchRemoteSnapshot(sshAlias, timeoutMs),
      { negativeTtlMs: 30_000 },
    );
  } catch {
    // Public contract unchanged: callers still get an empty snapshot on failure, never
    // an exception. The difference is the failure is only remembered for 30s.
    return EMPTY_SNAPSHOT;
  }
}

// Kept for discovery.ts, which only needs the container list and already wraps this in
// its own longer (5min) cache — existence-of-a-project isn't time sensitive the way
// resource usage is, so layering a longer cache on top of this one is fine.
export async function listRemoteContainers(sshAlias: string, timeoutMs = 8000): Promise<ContainerSummary[]> {
  const snapshot = await getRemoteSnapshot(sshAlias, timeoutMs);
  return snapshot.containers;
}
