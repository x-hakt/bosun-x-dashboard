import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { auth } from "@/auth";
import type { NextAuthRequest } from "next-auth";
import { isAuthEnabled } from "@/lib/auth-config";

// Named `proxy.ts` (not `middleware.ts`) per the Next.js 16 rename.
// Callback takes (req, event) — matching NextAuthMiddleware's exact shape disambiguates
// the `auth()` overload from the (req, ctx) => AppRouteHandlerFn route-handler overload.
const gated = auth((req: NextAuthRequest, _event: NextFetchEvent) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isAuthEnabled || request.nextUrl.pathname === "/login") return NextResponse.next();
  return gated(request, event);
}

export const config = {
  matcher: ["/((?!api/health|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
