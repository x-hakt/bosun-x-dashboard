import fs from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import { hostsFile } from "./paths";
import { loadConfig } from "./config";
import { HostsYmlSchema } from "./schema";
import type { Host } from "@/lib/types";

export async function loadHosts(): Promise<Host[]> {
  let raw: string;
  try {
    raw = await fs.readFile(hostsFile(), "utf-8");
  } catch {
    return [];
  }
  const parsed = HostsYmlSchema.safeParse(loadYaml(raw));
  return parsed.success ? parsed.data.hosts.map((h) => ({ ...h, nebula_ip: h.nebula_ip ?? undefined, lan_ip: h.lan_ip ?? undefined, public_ip: h.public_ip ?? undefined, ssh_alias: h.ssh_alias ?? undefined })) : [];
}

export async function getHost(id: string): Promise<Host | null> {
  const hosts = await loadHosts();
  return hosts.find((h) => h.id === id) ?? null;
}

// The id of the machine this dashboard runs on: config.yml `local_host`, else the
// one host in hosts.yml with no ssh_alias, else "local". This is where compose files
// and project paths are on the local filesystem rather than reached over SSH.
export async function localHostId(): Promise<string> {
  const configured = loadConfig().localHost;
  if (configured) return configured;
  const noAlias = (await loadHosts()).find((h) => !h.ssh_alias);
  return noAlias?.id ?? "local";
}
