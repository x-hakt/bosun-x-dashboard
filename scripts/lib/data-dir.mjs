// Resolve the bosun-x data directory for the wrapper/one-off scripts in this repo.
// The Next app uses DATA_DIR directly (see src/lib/data/paths.ts); this is only for
// the Node scripts that shell out to the `bosun-x` package or walk the data tree.
//
// Order:
//   1. $BOSUN_DATA / $DATA_DIR                      — explicit override
//   2. a `.bosun-data-path` file at the repo root   — one line, abs or repo-relative
//   3. first existing sibling: ../bosun-x-data, ../control-room-data
//   4. ./data                                       — the local-dev seed
import fs from "node:fs";
import path from "node:path";

export function resolveDataDir(repoRoot) {
  if (process.env.BOSUN_DATA) return path.resolve(process.env.BOSUN_DATA);
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);

  try {
    const pointer = fs.readFileSync(path.join(repoRoot, ".bosun-data-path"), "utf-8").trim();
    if (pointer) return path.resolve(repoRoot, pointer);
  } catch {
    // no pointer file — fall through
  }

  const parent = path.dirname(repoRoot);
  for (const name of ["bosun-x-data", "control-room-data"]) {
    const candidate = path.join(parent, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(repoRoot, "data");
}
