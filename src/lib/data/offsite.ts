import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { DATA_DIR } from "./paths";
import { receiptsDir } from "./config";
import { loadDestinations } from "./backups";

// CR-32 — the off-site copy of the critical set. Config in
// control-room-data/infra/offsite.yml, pushed by scripts/fleet-offsite-push.sh
// (rclone), receipts at <receipts>/_offsite/<item>.latest.json. Read-only here.

const ITEMS = ["gp-forms", "secrets", "control-room-data"] as const;
const GRACE_HOURS = 26;

export interface OffsiteItemStatus {
  name: string;
  ok: boolean | null; // null = unconfigured / not pushed yet
  pushedAt?: string;
  ageHours?: number;
  remote?: string;
  error?: string;
}

export interface OffsiteStatus {
  configured: boolean; // offsite.yml is present
  enabled: boolean;
  destination?: string;
  bucket?: string;
  kind?: string;
  keepLast?: number;
  items: OffsiteItemStatus[];
  stale: boolean; // enabled, but the newest successful push is old / missing
}

interface OffsiteConfig {
  enabled?: boolean;
  destination?: string;
  keep_last?: number;
}
interface ItemReceipt {
  pushed_at?: string;
  ok?: boolean | null;
  remote?: string;
  error?: string;
}

export async function getOffsiteStatus(): Promise<OffsiteStatus> {
  let cfg: OffsiteConfig | null = null;
  try {
    cfg = (loadYaml(await fs.readFile(path.join(DATA_DIR, "infra", "offsite.yml"), "utf-8")) ?? {}) as OffsiteConfig;
  } catch {
    return { configured: false, enabled: false, items: [], stale: false };
  }

  const dest = cfg.destination
    ? (await loadDestinations()).find((d) => d.id === cfg!.destination)
    : undefined;

  const items: OffsiteItemStatus[] = await Promise.all(
    ITEMS.map(async (name) => {
      let r: ItemReceipt | null = null;
      try {
        r = JSON.parse(
          await fs.readFile(path.join(receiptsDir(), "_offsite", `${name}.latest.json`), "utf-8"),
        ) as ItemReceipt;
      } catch {
        r = null;
      }
      const ageHours = r?.pushed_at
        ? Math.max(0, (Date.now() - Date.parse(r.pushed_at)) / 3_600_000)
        : undefined;
      return {
        name,
        ok: r ? (r.ok ?? null) : null,
        pushedAt: r?.pushed_at,
        ageHours,
        remote: r?.remote || undefined,
        error: r?.error || undefined,
      };
    }),
  );

  const enabled = cfg.enabled === true;
  const stale =
    enabled &&
    items.some((i) => i.ok !== true || i.ageHours === undefined || i.ageHours > 24 + GRACE_HOURS);

  return {
    configured: true,
    enabled,
    destination: cfg.destination,
    bucket: dest?.bucket,
    kind: dest?.kind,
    keepLast: cfg.keep_last,
    items,
    stale,
  };
}
