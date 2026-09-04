// The two share gates, as one pure function — no imports, so it can be unit
// tested in isolation (scripts/test/portal-gates.mjs) and can't drift from the
// projection that uses it.
//
//   Gate 1  portals includes the portal slug     → "this is <business> work"
//   Gate 2  shared_with includes the client slug → "this client may see it"
// An operator viewer clears Gate 2 automatically.

export type PortalViewer = { kind: "operator" } | { kind: "client"; slug: string };

export function passesGates(
  portals: string[] | undefined,
  sharedWith: string[] | undefined,
  viewer: PortalViewer,
  portalSlug: string,
): boolean {
  if (!portalSlug) return false;
  if (!portals?.includes(portalSlug)) return false; // Gate 1
  if (viewer.kind === "operator") return true;
  return Boolean(sharedWith?.includes(viewer.slug)); // Gate 2
}

// Whether a viewer may see (and, for a client, reply into) one task's own
// thread. The project must pass both gates first; then the task itself must be
// shared with this client (an operator sees every task in a portal project).
// Used by both the projection (to expose `detail`) and reply.ts (to accept a
// task reply) so the two can't drift.
export function canSeeSharedTask(
  projectPortals: string[] | undefined,
  projectSharedWith: string[] | undefined,
  taskSharedWith: string[] | undefined,
  viewer: PortalViewer,
  portalSlug: string,
): boolean {
  if (!passesGates(projectPortals, projectSharedWith, viewer, portalSlug)) return false;
  if (viewer.kind === "operator") return true;
  return Boolean(taskSharedWith?.includes(viewer.slug));
}
