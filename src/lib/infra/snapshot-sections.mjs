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

// BXD-65: per-project disk footprint. Read-only, like the snapshot above, and built
// from docker + coreutils only so the same sequence can later run on the remote hosts
// (BXD-66). Every docker call selects exact fields with a Go template: a container's
// Command, Labels and environment can hold secrets (a Redis --requirepass was found in
// testing), so they never leave Docker.
//   SYSTEM_DF  I<TAB>image id, size, unique size   (shared base layers aren't in unique)
//              C<TAB>container name, writable-layer size
//              V<TAB>volume name, size
//   MOUNTS     C<TAB>container, image id  +  M<TAB>container, type, volume name, source, rw
//   BIND_DU    `du -sb` of every writable bind-mount directory on the root filesystem
//              (unreadable subfolders are skipped, so these can read low)
export const LOCAL_DISK_SCRIPT = `
echo "===DISK==="
df -B1 -P / | tail -1 | awk '{print $2, $3, $4, $5}'
echo "===SYSTEM_DF==="
docker system df -v --format '{{range .Images}}I{{"\\t"}}{{.ID}}{{"\\t"}}{{.Size}}{{"\\t"}}{{.UniqueSize}}{{println}}{{end}}{{range .Containers}}C{{"\\t"}}{{.Names}}{{"\\t"}}{{.Size}}{{println}}{{end}}{{range .Volumes}}V{{"\\t"}}{{.Name}}{{"\\t"}}{{.Size}}{{println}}{{end}}' 2>/dev/null
echo "===MOUNTS==="
ids=$(docker ps -aq)
[ -n "$ids" ] && docker inspect --format '{{$n := .Name}}C{{"\\t"}}{{$n}}{{"\\t"}}{{.Image}}{{println}}{{range .Mounts}}M{{"\\t"}}{{$n}}{{"\\t"}}{{.Type}}{{"\\t"}}{{.Name}}{{"\\t"}}{{.Source}}{{"\\t"}}{{.RW}}{{println}}{{end}}' $ids 2>/dev/null
echo "===BIND_DU==="
root_dev=$(stat -c %d /)
[ -n "$ids" ] && docker inspect --format '{{range .Mounts}}{{if and (eq .Type "bind") .RW}}{{.Source}}{{println}}{{end}}{{end}}' $ids 2>/dev/null | sort -u | while IFS= read -r p; do
  [ -d "$p" ] && [ "$(stat -c %d "$p")" = "$root_dev" ] && du -sb "$p" 2>/dev/null | tail -1
done
echo "===END==="
`;

/**
 * Parse LOCAL_DISK_SCRIPT output. `docker system df` sizes are decimal strings
 * ("186.1MB"), converted with parseMemUsage's unit table.
 * @param {string} raw
 */
export function parseDiskSections(raw) {
  const diskParts = section(raw, "DISK").trim().split(/\s+/);
  const bytes = (/** @type {string | undefined} */ v) => Math.round(parseMemUsage(v ?? "0"));

  const images = [];
  /** @type {Map<string, number>} */
  const writable = new Map();
  const volumes = [];
  for (const line of section(raw, "SYSTEM_DF").split("\n")) {
    const [kind, ...f] = line.split("\t");
    if (kind === "I" && f[0]) images.push({ id: f[0], size: bytes(f[1]), unique: bytes(f[2]) });
    else if (kind === "C" && f[0]) writable.set(f[0], bytes(f[1]));
    else if (kind === "V" && f[0]) volumes.push({ name: f[0], size: bytes(f[1]) });
  }

  /** @type {Map<string, { name: string; imageId: string; writable: number; volumes: string[]; binds: string[] }>} */
  const containers = new Map();
  for (const line of section(raw, "MOUNTS").split("\n")) {
    const [kind, rawName, ...f] = line.split("\t");
    if (!rawName) continue;
    const name = rawName.replace(/^\//, "");
    if (kind === "C") {
      containers.set(name, { name, imageId: f[0] ?? "", writable: writable.get(name) ?? 0, volumes: [], binds: [] });
    } else if (kind === "M") {
      const c = containers.get(name);
      if (!c) continue;
      const [type, volName, source, rw] = f;
      if (type === "volume" && volName) c.volumes.push(volName);
      else if (type === "bind" && rw === "true" && source) c.binds.push(source);
    }
  }

  /** @type {Record<string, number>} */
  const bindDu = {};
  for (const line of section(raw, "BIND_DU").split("\n")) {
    const m = /^(\d+)\s+(\/.*)$/.exec(line.trim());
    if (m) bindDu[m[2]] = Number(m[1]);
  }

  return {
    diskSizeBytes: Number(diskParts[0]) || 0,
    diskUsedBytes: Number(diskParts[1]) || 0,
    images,
    containers: [...containers.values()],
    volumes,
    bindDu,
  };
}
