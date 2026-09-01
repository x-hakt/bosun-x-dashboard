import { getHost, localHostId } from "@/lib/data/hosts";
import { resolveHostId } from "@/lib/infra/project-host";
import type { Project } from "@/lib/types";

export type CheckTarget =
  | { mode: "local"; path: string }
  | { mode: "remote"; sshAlias: string; path: string }
  | { mode: "none" };

// Where a project's git/file checks should actually run, if anywhere — used by the
// standards registry (registry.ts) and the project detail page so host logic isn't
// reimplemented (and drifted on) in more than one place.
// Vendored projects and anything without a path are never checkable regardless of
// host. Projects on the local host check locally (its filesystem is where the app
// runs / is bind-mounted). Everything else checks remotely IF that host has a
// dedicated discovery SSH alias — the forced command on the other end enforces its
// own exact path allowlist regardless of what's requested here, so a project whose
// path isn't covered just gets a clean empty/rejected result, not a wrong one.
export async function resolveCheckTarget(project: Project): Promise<CheckTarget> {
  if (project.meta.vendored) return { mode: "none" };
  if (!project.meta.path) return { mode: "none" };
  if (project.meta.host && project.meta.host === (await localHostId())) {
    return { mode: "local", path: project.meta.path };
  }

  const hostId = resolveHostId(project.meta.host);
  if (!hostId) return { mode: "none" };
  const host = await getHost(hostId);
  if (!host?.ssh_alias) return { mode: "none" };
  return { mode: "remote", sshAlias: host.ssh_alias, path: project.meta.path };
}
