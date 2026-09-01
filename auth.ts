import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import type { Provider } from "next-auth/providers";
import { isAuthEnabled, isAllowedEmail } from "@/lib/auth-config";

// Providers are picked up from environment variables — set the pair for whichever
// you want (multiple is fine; the login page shows one button each). With none set
// the dashboard is open. See docs/auth.md.
//   Google  → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   GitHub  → GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//   OIDC    → OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET (+ optional OIDC_NAME)
//            covers Authentik, Keycloak, Auth0, Zitadel, Okta, Pocket ID, Kanidm…
function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    list.push(Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }));
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    list.push(GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }));
  }
  if (process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET) {
    list.push({
      id: "oidc",
      name: process.env.OIDC_NAME?.trim() || "SSO",
      type: "oidc",
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    });
  }
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true, // behind a reverse proxy terminating TLS
  providers: providers(),
  callbacks: {
    async signIn({ user }) {
      if (!isAuthEnabled) return true;
      return isAllowedEmail(user.email);
    },
  },
  pages: { signIn: "/login" },
});
