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
