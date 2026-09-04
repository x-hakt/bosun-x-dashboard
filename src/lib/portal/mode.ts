// Portal-mode env reads. Pure `process.env` — safe to import from proxy.ts (edge).
//
// One image, two roles:
//   BOSUN_MODE unset / "operator"  → the full dashboard (default)
//   BOSUN_MODE = "portal"          → the client portal only, served under /c,
//                                    operator routes rewritten out of reach.
// BOSUN_PORTAL names which portal (a key in clients.yml `portals:`) this
// deployment serves.

export const PORTAL_MODE = process.env.BOSUN_MODE === "portal";
export const PORTAL_SLUG = (process.env.BOSUN_PORTAL ?? "").trim();

// The URL prefix every portal route lives under. proxy.ts prepends it in portal
// mode so the client sees clean URLs.
export const PORTAL_PREFIX = "/c";
