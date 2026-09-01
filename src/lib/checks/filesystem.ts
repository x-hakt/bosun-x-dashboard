import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cached } from "@/lib/util/ttl-cache";

const execFileAsync = promisify(execFile);

export async function anyFileExists(projectPath: string | undefined, names: string[]): Promise<boolean> {
  if (!projectPath) return false;
  for (const name of names) {
    try {
      await fs.access(path.join(projectPath, name));
      return true;
    } catch {
      // keep checking
    }
  }
  return false;
}

const SCAN_EXTENSIONS = ["*.md", "*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.go", "*.rs"];
const FACTS_CACHE_TTL_MS = 5 * 60_000;

// Originally a hand-rolled recursive walk that `readFile`'d every matching file one at
// a time in JS — fine for a small project, but ~20+ seconds on a large multi-service
// monorepo (measured: ~24s total page load on a large monorepo, dominated by this). `grep`
// is the right tool for "search file contents across a tree" — but plain recursive
// grep still traversed multi-GB uploads/vendor trees just to discover they didn't match
// an include glob (measured at a few seconds on large repos). `git grep`
// searches only tracked source files and uses Git's index, which is both faster and the
// correct scope for code-quality facts. Non-repositories return zero and render n/a.
export async function countTodoFixme(projectPath?: string): Promise<number> {
  if (!projectPath) return 0;
  return cached(`todo:${projectPath}`, FACTS_CACHE_TTL_MS, async () => {
    try {
      const args = [
        "-C", projectPath,
        "grep", "-Eoh",
        "\\b(TODO|FIXME)\\b",
        "--",
        ...SCAN_EXTENSIONS,
      ];
      const { stdout } = await execFileAsync("git", args);
      return stdout.split("\n").filter((l) => l.trim()).length;
    } catch (err: unknown) {
      // grep exits 1 (not an error here) when it simply finds no matches at all.
      const code = (err as { code?: number }).code;
      if (code === 1) return 0;
      return 0;
    }
  });
}

export async function diskUsageBytes(projectPath?: string): Promise<number | undefined> {
  if (!projectPath) return undefined;
  return cached(`du:${projectPath}`, FACTS_CACHE_TTL_MS, async () => {
    try {
      const { stdout } = await execFileAsync("du", ["-sb", projectPath]);
      const [size] = stdout.trim().split("\t");
      return Number(size);
    } catch {
      return undefined;
    }
  });
}
