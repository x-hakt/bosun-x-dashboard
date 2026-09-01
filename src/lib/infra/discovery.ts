import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { listContainers, type ContainerSummary } from "./docker";
import { listRemoteContainers } from "./remote";
import { listProjects } from "@/lib/data/projects";
import { getContainerRefs } from "@/lib/data/project-display";
import { cached } from "@/lib/util/ttl-cache";
import { loadConfig } from "@/lib/data/config";
import { loadHosts, localHostId } from "@/lib/data/hosts";

// Every other mesh host to sweep, from hosts.yml: any `live_monitored` host with an
// ssh_alias (a discovery-only key forced to run `docker ps` and nothing else).
async function remoteHosts(): Promise<{ host: string; sshAlias: string }[]> {
  const local = await localHostId();
  return (await loadHosts())
    .filter((h) => h.ssh_alias && h.live_monitored && h.id !== local)
    .map((h) => ({ host: h.id, sshAlias: h.ssh_alias as string }));
}

export interface DiscoveredGroup {
  key: string; // stable identifier for this candidate — "<host>:<folder-or-project>"
  host: string;
  composeProject: string;
  folder: string;
  containers: ContainerSummary[];
  matched: boolean;
  matchedSlug?: string;
  reachable: boolean; // false only for a remote host that couldn't be polled at all
}

interface ComposeService {
  build?: { context?: string } | string;
  container_name?: string;
}
interface ComposeFile {
  services?: Record<string, ComposeService>;
}

interface ComposeScanResult {
  // service name -> resolved build-context folder (only for services with a `build:` key —
  // used to disambiguate the shared "unified-services" compose project's many sub-apps).
  buildContexts: Map<string, string>;
  // container name (container_name if set, else the service key) -> the folder holding
  // that compose file — works host-wide, including for containers that currently have NO
  // compose labels at all (drifted from `docker compose up`, e.g. started via plain `docker
  // run`), since this is derived from the compose *file* on disk, not the running container.
  containerFolders: Map<string, string>;
}

async function parseComposeFile(fullPath: string, dir: string, into: ComposeScanResult): Promise<void> {
  let parsed: ComposeFile;
  try {
    const raw = await fs.readFile(fullPath, "utf-8");
    parsed = (loadYaml(raw) as ComposeFile) ?? {};
  } catch {
    return;
  }
  for (const [serviceName, def] of Object.entries(parsed.services ?? {})) {
    const context = typeof def.build === "string" ? def.build : def.build?.context;
    if (context) into.buildContexts.set(serviceName, path.resolve(dir, context));
    into.containerFolders.set(def.container_name || serviceName, dir);
  }
}

// Scans the local-host directories in config.yml `project_roots` for
// docker-compose*.yml files. A plain path is scanned directly; a path ending "/*" is
// expanded to each of its immediate subdirectories (so `~/*` finds
// `~/jellyfin-server/docker-compose.yml`). Read-only; never executes anything from
// these files, only parses the `services:` block.
async function scanComposeFiles(): Promise<ComposeScanResult> {
  const result: ComposeScanResult = { buildContexts: new Map(), containerFolders: new Map() };

  const composeFilesIn = async (dir: string): Promise<string[]> => {
    try {
      return (await fs.readdir(dir)).filter((f) => /^docker-compose.*\.ya?ml$/.test(f)).map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  };

  const dirs = new Set<string>();
  for (const root of loadConfig().projectRoots) {
    if (root.endsWith("/*")) {
      const base = root.slice(0, -2);
      try {
        for (const e of await fs.readdir(base, { withFileTypes: true })) {
          if (e.isDirectory()) dirs.add(path.join(base, e.name));
        }
      } catch {
        // unreadable root — skip
      }
    } else {
      dirs.add(root);
    }
  }

  for (const dir of dirs) {
    for (const file of await composeFilesIn(dir)) {
      await parseComposeFile(file, dir, result);
    }
  }

  return result;
}

function groupContainers(
  host: string,
  isLocal: boolean,
  sharedProject: string | undefined,
  containers: ContainerSummary[],
  groups: Map<string, DiscoveredGroup>,
  scan?: ComposeScanResult,
) {
  for (const c of containers) {
    let folder: string | undefined;

    if (c.composeProject) {
      if (isLocal && sharedProject && c.composeProject === sharedProject) {
        // The one big compose project with many sub-apps — only services with their
        // own build context are distinct "projects"; shared infra pieces (traefik,
        // etc.) run from external images and have no folder, so skip them.
        folder = c.composeService ? scan?.buildContexts.get(c.composeService) : undefined;
        if (!folder) continue;
      } else {
        // Remote hosts sometimes have compose labels without a working_dir (seen on
        // a remote host) — fall back to the compose project name itself in that case.
        folder = c.composeWorkingDir || c.composeProject;
      }
    } else if (isLocal) {
      // No compose labels at all (drifted from its own compose file, e.g. started via
      // plain `docker run`) — only the local host has compose *files* on disk, so
      // this cross-reference only applies here.
      folder = scan?.containerFolders.get(c.name);
      if (!folder) continue;
    } else {
      continue;
    }

    const key = `${host}:${folder}`;
    if (!groups.has(key)) {
      groups.set(key, { key, host, composeProject: c.composeProject || "(none — unlabeled container)", folder, containers: [], matched: false, reachable: true });
    }
    groups.get(key)!.containers.push(c);
  }
}

async function computeDiscoveredGroups(): Promise<DiscoveredGroup[]> {
  const local = await localHostId();
  const remotes = await remoteHosts();
  const sharedProject = loadConfig().sharedComposeProject;

  const [localContainers, scan, projects, ...remoteResults] = await Promise.all([
    listContainers().catch(() => [] as ContainerSummary[]),
    scanComposeFiles(),
    listProjects(),
    ...remotes.map((h) => listRemoteContainers(h.sshAlias)),
  ]);

  const groups = new Map<string, DiscoveredGroup>();
  groupContainers(local, true, sharedProject, localContainers, groups, scan);

  remotes.forEach((h, i) => {
    const containers = remoteResults[i];
    groupContainers(h.host, false, sharedProject, containers, groups);
    // listRemoteContainers returns [] both for "reachable but nothing running" and
    // "couldn't connect at all" — mark unreachable only when we got literally nothing,
    // since that's the case worth surfacing distinctly (vs. a genuinely empty host).
    if (containers.length === 0) {
      groups.set(`${h.host}:__unreachable__`, {
        key: `${h.host}:__unreachable__`,
        host: h.host,
        composeProject: "",
        folder: "(host unreachable or no containers)",
        containers: [],
        matched: true, // never show this placeholder as an actionable "unregistered" row
        reachable: false,
      });
    }
  });

  // A group is "matched" if some tracked project already claims this folder (host+path),
  // explicitly names one of this group's containers, or lists this deployment under
  // `also_on` (a known staged migration / blue-green copy).
  for (const project of projects) {
    const refs = getContainerRefs(project.meta);
    for (const group of groups.values()) {
      let hit = false;

      if (project.meta.host === group.host) {
        const pathMatch = project.meta.path && group.host === local && path.resolve(project.meta.path) === group.folder;
        const serviceMatch = refs.some((r) => r.compose_service && group.containers.some((c) => c.name === r.compose_service));
        hit = Boolean(pathMatch || serviceMatch);
      }

      for (const extra of project.meta.also_on ?? []) {
        if (extra.host !== group.host) continue;
        // The remote folder is either a working_dir path or (no label) the compose
        // project name — accept a match on the declared path, its basename, or the slug.
        if (
          (extra.path && (group.folder === extra.path || path.basename(group.folder) === path.basename(extra.path)))
          || group.composeProject === project.meta.slug
        ) {
          hit = true;
        }
      }

      if (hit) {
        group.matched = true;
        group.matchedSlug = project.meta.slug;
      }
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.host.localeCompare(b.host) || a.folder.localeCompare(b.folder));
}

// Discovery walks compose files and polls every remote host. Project existence changes
// rarely, so it must not sit uncached in Overview and /projects navigation paths.
export async function discoverGroups(): Promise<DiscoveredGroup[]> {
  return cached("discovery:groups", 5 * 60_000, computeDiscoveredGroups);
}
