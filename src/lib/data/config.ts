import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { DATA_DIR, configFile } from "./paths";
import { ConfigYmlSchema } from "./schema";

// The instance config (CR-15). Read once, synchronously, and cached — it's tiny and
// used in hot paths (timestamps). Every field falls back to a value that reproduces
// "a single local host, system zone, open access, the home dir scanned", so the
// dashboard runs with no config.yml at all.

export interface InstanceConfig {
  timezone: string | undefined; // undefined => use the system zone
  operators: string[]; // lowercased; empty => no allowlist
  localHost: string | undefined; // hosts.yml id; undefined => the host with no ssh_alias
  projectRoots: string[]; // absolute; a trailing "/*" means "one level into each subdir"
  remoteProjectPath: string;
  sshConfig: string;
  backupReceipts: string;
  sharedComposeProject: string | undefined;
}

const homeRoot = process.env.HOME || "/root";

const DEFAULTS: InstanceConfig = {
  timezone: undefined,
  operators: [],
  localHost: undefined,
  projectRoots: [homeRoot],
  remoteProjectPath: "/opt",
  sshConfig: path.join(homeRoot, ".ssh", "config"),
  backupReceipts: path.join(DATA_DIR, "..", "backup-receipts"),
  sharedComposeProject: undefined,
};

let cached: InstanceConfig | undefined;

// Bust the cache after a write from the Settings page. Note: some fields (host lists,
// project roots) also want a redeploy to fully take effect on every code path.
export function clearConfigCache(): void {
  cached = undefined;
}

// The config.yml exactly as written — used by the Settings page to show what's
// explicitly set vs. defaulted. Returns {} when the file is absent or invalid.
export function loadRawConfig(): Record<string, unknown> {
  try {
    const raw = loadYaml(fs.readFileSync(configFile(), "utf-8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadConfig(): InstanceConfig {
  if (cached) return cached;
  let raw: unknown;
  try {
    raw = loadYaml(fs.readFileSync(configFile(), "utf-8"));
  } catch {
    cached = DEFAULTS;
    return cached;
  }
  const parsed = ConfigYmlSchema.safeParse(raw);
  if (!parsed.success) {
    cached = DEFAULTS;
    return cached;
  }
  const c = parsed.data;
  cached = {
    timezone: c.timezone?.trim() || undefined,
    operators: (c.operators ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
    localHost: c.local_host?.trim() || undefined,
    projectRoots: (c.project_roots ?? DEFAULTS.projectRoots).map((p) => resolveHome(p)),
    remoteProjectPath: c.remote_project_path?.trim() || DEFAULTS.remoteProjectPath,
    sshConfig: c.ssh_config ? resolveHome(c.ssh_config) : DEFAULTS.sshConfig,
    backupReceipts: c.backup_receipts ? resolveHome(c.backup_receipts) : DEFAULTS.backupReceipts,
    sharedComposeProject: c.shared_compose_project?.trim() || undefined,
  };
  return cached;
}

// Where fleet-backup.sh writes receipts (log.jsonl + <store>.latest.json per project).
// $BACKUP_RECEIPTS wins; else config.yml `backup_receipts`; else <data>/../backup-receipts.
export function receiptsDir(): string {
  return process.env.BACKUP_RECEIPTS ? path.resolve(process.env.BACKUP_RECEIPTS) : loadConfig().backupReceipts;
}

function resolveHome(p: string): string {
  const expanded = p.startsWith("~/") ? path.join(homeRoot, p.slice(2)) : p;
  // keep a trailing "/*" glob marker intact; resolve the rest
  return expanded.endsWith("/*") ? path.resolve(expanded.slice(0, -2)) + "/*" : path.resolve(expanded);
}
