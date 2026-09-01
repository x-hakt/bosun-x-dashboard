import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DiskUsage {
  path: string;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usePercent: number;
}

export async function getDiskUsage(mountPath: string): Promise<DiskUsage | null> {
  try {
    const { stdout } = await execFileAsync("df", ["-B1", "--output=size,used,avail,pcent", mountPath]);
    const lines = stdout.trim().split("\n");
    const dataLine = lines[lines.length - 1].trim().split(/\s+/);
    const [size, used, avail, pcent] = dataLine;
    return {
      path: mountPath,
      sizeBytes: Number(size),
      usedBytes: Number(used),
      availBytes: Number(avail),
      usePercent: Number(pcent.replace("%", "")),
    };
  } catch {
    return null;
  }
}
