import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { auth } from "@/auth";
import type { NextAuthRequest } from "next-auth";
import { isAuthEnabled } from "@/lib/auth-config";
import { PORTAL_MODE, PORTAL_PREFIX } from "@/lib/portal/mode";

// Named `proxy.ts` (not `middleware.ts`) per the Next.js 16 rename.
// Callback takes (req, event) — matching NextAuthMiddleware's exact shape disambiguates
// the `auth()` overload from the (req, ctx) => AppRouteHandlerFn route-handler overload.
const gated = auth((req: NextAuthRequest, _event: NextFetchEvent) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  return NextResponse.next();
});

// Portal mode: always gated (clients.yml is the allowlist — there is no "open"),
// and every request that isn't already under /c or an /api route gets the /c
// prefix. Operator routes (`/servers`, `/projects/x`, …) then resolve to a path
// that doesn't exist under /c and 404 — the portal cannot render operator pages.
const portalGated = auth((req: NextAuthRequest, _event: NextFetchEvent) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  const { pathname } = req.nextUrl;
  if (pathname.startsWith(PORTAL_PREFIX) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = PORTAL_PREFIX + (pathname === "/" ? "" : pathname);
  return NextResponse.rewrite(url);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === "/login") return NextResponse.next();
  if (PORTAL_MODE) return portalGated(request, event);
  if (!isAuthEnabled) return NextResponse.next();
  return gated(request, event);
}

export const config = {
  matcher: ["/((?!api/health|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
