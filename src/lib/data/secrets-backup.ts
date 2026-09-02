import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { DATA_DIR } from "./paths";
import { receiptsDir } from "./config";

// CR-31 — the fleet secrets bundle (env files, SSH keys, Nebula cert). Config in
// control-room-data/infra/secrets-backup.yml, written nightly by
// scripts/fleet-secrets-backup.sh, receipt at <receipts>/_secrets/bundle.latest.json.
// Read-only here.

export interface SecretsBackupStatus {
  configured: boolean;
  destination?: string;
  keepLast?: number;
  encrypted: boolean; // always true when configured — there is no plaintext mode
  pathCount?: number; // paths declared in the config
  lastRunAt?: string;
  ageHours?: number;
  ok: boolean | null; // null = no receipt yet
  files?: number; // paths captured in the last bundle
  bytes?: number;
  archive?: string;
  error?: string;
  stale: boolean; // ok but older than a day + grace, or never run
}

const GRACE_HOURS = 14;

interface ConfigShape {
  destination?: string;
  keep_last?: number;
  age_recipient?: string;
  paths?: unknown[];
}
interface ReceiptShape {
  finished_at?: string;
  ok?: boolean;
  bytes?: number;
  files?: number;
  archive?: string;
  error?: string;
}

export async function getSecretsBackupStatus(): Promise<SecretsBackupStatus> {
  let cfg: ConfigShape | null = null;
  try {
    cfg = (loadYaml(await fs.readFile(path.join(DATA_DIR, "infra", "secrets-backup.yml"), "utf-8")) ?? {}) as ConfigShape;
  } catch {
    return { configured: false, encrypted: false, ok: null, stale: false };
  }

  let r: ReceiptShape | null = null;
  try {
    r = JSON.parse(await fs.readFile(path.join(receiptsDir(), "_secrets", "bundle.latest.json"), "utf-8")) as ReceiptShape;
  } catch {
    r = null;
  }

  const ageHours = r?.finished_at ? Math.max(0, (Date.now() - Date.parse(r.finished_at)) / 3_600_000) : undefined;
  const stale = r?.ok === true ? ageHours === undefined || ageHours > 24 + GRACE_HOURS : true;

  return {
    configured: true,
    destination: cfg.destination,
    keepLast: cfg.keep_last,
    encrypted: true,
    pathCount: Array.isArray(cfg.paths) ? cfg.paths.length : undefined,
    lastRunAt: r?.finished_at,
    ageHours,
    ok: r ? Boolean(r.ok) : null,
    files: r?.files,
    bytes: r?.bytes,
    archive: r?.archive,
    error: r?.error || undefined,
    stale,
  };
}
