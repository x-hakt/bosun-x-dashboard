// Parsers for the section-tagged output of the read-only snapshot script
// (bosun-x-ro.sh on remote hosts, the same command sequence in local.ts). Plain ESM
// with no dependencies so both the app (remote.ts, via allowJs) and the host-side
// capacity sampler (scripts/capacity-sample.mjs, BXD-62) share one implementation.

/**
 * The text between `===NAME===` and the next `===` marker, trimmed.
 * @param {string} body
 * @param {string} name
 * @returns {string}
 */
export function section(body, name) {
  const marker = `===${name}===`;
  const start = body.indexOf(marker);
  if (start === -1) return "";
  const from = start + marker.length;
  const nextMarker = body.indexOf("===", from);
  return body.slice(from, nextMarker === -1 ? undefined : nextMarker).trim();
}

/**
 * Host-level figures: kernel/cores, memory (`free -b`), root disk, 1-min load.
 * `hasMem` is false when the MEMINFO section is missing entirely.
 * @param {string} raw
 */
export function parseHostFigures(raw) {
  const uname = section(raw, "UNAME"); // "Linux 5.15.152-1-pve x86_64"
  const nproc = Number.parseInt(section(raw, "NPROC"), 10);

  const meminfo = section(raw, "MEMINFO"); // `free -b` output
  const memLine = meminfo.split("\n").find((l) => l.startsWith("Mem:"));
  const memParts = memLine?.trim().split(/\s+/) ?? [];
  // free -b: Mem: total used free shared buff/cache available
  const memTotalBytes = Number(memParts[1]) || 0;
  const memAvailBytes = Number(memParts[6]) || 0;
  const memUsedBytes = memTotalBytes && memAvailBytes ? memTotalBytes - memAvailBytes : Number(memParts[2]) || 0;

  const diskParts = section(raw, "DISK").trim().split(/\s+/); // "size used avail pcent%"
  const loadLine = section(raw, "LOAD"); // "0.12 0.08 0.05 1/370 3574090"

  return {
    kernel: uname,
    cores: Number.isFinite(nproc) ? nproc : 0,
    hasMem: Boolean(meminfo),
    memTotalBytes,
    memUsedBytes,
    memAvailBytes,
    diskSizeBytes: Number(diskParts[0]) || 0,
    diskUsedBytes: Number(diskParts[1]) || 0,
    diskAvailBytes: Number(diskParts[2]) || 0,
    diskUsePercent: Number.parseInt(diskParts[3] ?? "0", 10) || 0,
    loadAvg1: Number.parseFloat(loadLine.split(/\s+/)[0]) || 0,
  };
}

/**
 * `docker stats --format '{{json .}}'` lines → per-container stats. A malformed line
 * is skipped rather than taking down the rest.
 * @param {string} block
 * @returns {{ name: string; cpuPercent: number; memUsage: string; memPercent: number }[]}
 */
export function parseStatsLines(block) {
  const out = [];
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      out.push({
        name: String(parsed.Name),
        cpuPercent: Number.parseFloat(parsed.CPUPerc) || 0,
        memUsage: String(parsed.MemUsage ?? ""),
        memPercent: Number.parseFloat(parsed.MemPerc) || 0,
      });
    } catch {
      // skip
    }
  }
  return out;
}

/** @type {Record<string, number>} */
const UNITS = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
};

/**
 * docker stats MemUsage: "123.4MiB / 15.5GiB" → bytes of the left-hand side.
 * @param {string} memUsage
 * @returns {number}
 */
export function parseMemUsage(memUsage) {
  const match = /^\s*([\d.]+)\s*([a-z]+)/i.exec(memUsage.split("/")[0] ?? "");
  if (!match) return 0;
  const factor = UNITS[match[2].toLowerCase()];
  return factor ? Number.parseFloat(match[1]) * factor : 0;
}

// The DISK line deliberately differs from the remote script (bosun-x-ro.sh) --
// this runs INSIDE the container itself, which is Alpine/BusyBox, not the GNU
// coreutils every remote host actually uses. BusyBox df has no --output= flag at all
// (it silently prints its own usage help instead of failing loudly), which made every
// disk number here parse to 0 rather than erroring -- a real bug, found by comparing
// against why the remote hosts worked fine. -P plus an awk reorder gets the same
// 4-field size/used/avail/pcent shape the shared parseSnapshot() already expects, so
// no parser change was needed, only this one command.
// Same fixed read-only command sequence as bosun-x-ro.sh (the remote hosts'
// forced SSH command) — run directly here since this is the host the dashboard
// itself lives on, no SSH hop needed. Sharing the exact section-tagged shape with the
// remote script lets both sides go through the one parseSnapshot() parser.
export const LOCAL_SNAPSHOT_SCRIPT = `
echo "===UNAME==="
uname -srm
echo "===NPROC==="
nproc
echo "===MEMINFO==="
free -b
echo "===DISK==="
df -B1 -P / | tail -1 | awk '{print $2, $3, $4, $5}'
echo "===LOAD==="
cat /proc/loadavg
echo "===DOCKER_PS==="
docker ps -a --format '{{json .}}'
echo "===DOCKER_STATS==="
docker stats --no-stream --format '{{json .}}' 2>/dev/null
`;
