import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cached } from "@/lib/util/ttl-cache";
import { parseSnapshot, type RemoteSnapshot } from "./remote";

const execFileAsync = promisify(execFile);

// The DISK line deliberately differs from the remote script (control-room-ro.sh) --
// this runs INSIDE the container itself, which is Alpine/BusyBox, not the GNU
// coreutils every remote host actually uses. BusyBox df has no --output= flag at all
// (it silently prints its own usage help instead of failing loudly), which made every
// disk number here parse to 0 rather than erroring -- a real bug, found by comparing
// against why the remote hosts worked fine. -P plus an awk reorder gets the same
// 4-field size/used/avail/pcent shape the shared parseSnapshot() already expects, so
// no parser change was needed, only this one command.
// Same fixed read-only command sequence as control-room-ro.sh (the remote hosts'
// forced SSH command) — run directly here since this is the host the dashboard
// itself lives on, no SSH hop needed. Sharing the exact section-tagged shape with the
// remote script lets both sides go through the one parseSnapshot() parser.
const SCRIPT = `
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

async function fetchLocalSnapshot(): Promise<RemoteSnapshot> {
  try {
    const { stdout } = await execFileAsync("sh", ["-c", SCRIPT], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
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
