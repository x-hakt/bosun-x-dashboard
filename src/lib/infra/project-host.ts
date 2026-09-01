import { getHost } from "@/lib/data/hosts";
import { getLocalSnapshot } from "./local";
import { getRemoteSnapshot } from "./remote";
import type { ContainerSummary } from "./docker";

// project.yml's `host:` field and hosts.yml's `id` use the same name for every machine,
// so this is a straight passthrough. It stays a named function so target.ts and
// getContainersForProject route host lookups through one place — if an alias is ever
// needed (a host renamed in hosts.yml but not yet in every project.yml), it goes here
// and nowhere else.
export function resolveHostId(metaHost?: string): string | undefined {
  return metaHost || undefined;
}

// A project's container status routes through the SAME host resolution + snapshot
// lookup the Servers pages use, so it's only ever "not monitored" when the host
// genuinely isn't (nothing configured, or a live_monitored: false host) — not because
// of where the project happens to run.
export async function getContainersForProject(metaHost?: string): Promise<{ containers: ContainerSummary[]; liveMonitored: boolean }> {
  const hostId = resolveHostId(metaHost);
  if (!hostId) return { containers: [], liveMonitored: false };
  // getHost()/getLocalSnapshot()/getRemoteSnapshot() already degrade internally on
  // their own failure modes (bad YAML, unreachable host, SSH timeout) -- this try/catch
  // is a backstop, not the primary defense. It exists because this function's callers
  // (the project detail page, the Projects list layout) used to wrap their container
  // fetch in .catch(() => []) individually before a refactor dropped that discipline --
  // restoring the safety net here, once, means every caller gets it back regardless of
  // whether they remember to add their own.
  try {
    const host = await getHost(hostId);
    if (!host?.live_monitored) return { containers: [], liveMonitored: false };
    const snapshot = host.ssh_alias ? await getRemoteSnapshot(host.ssh_alias) : await getLocalSnapshot();
    return { containers: snapshot.containers, liveMonitored: true };
  } catch {
    return { containers: [], liveMonitored: false };
  }
}
