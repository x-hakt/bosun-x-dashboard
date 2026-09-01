// Which sign-in providers are configured, from environment variables. Pure env
// reads — safe to import from the proxy / edge. The allowlist (below) reads
// config.yml so it stays a lazy async function.

export interface AuthProviderInfo {
  id: string;
  label: string;
}

export function configuredProviders(): AuthProviderInfo[] {
  const out: AuthProviderInfo[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    out.push({ id: "google", label: "Google" });
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    out.push({ id: "github", label: "GitHub" });
  }
  if (process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET) {
    out.push({ id: "oidc", label: process.env.OIDC_NAME?.trim() || "SSO" });
  }
  return out;
}

export const isAuthEnabled = configuredProviders().length > 0;

// Emails allowed to sign in. The single ALLOWED_EMAIL env var wins for backward
// compatibility; otherwise config.yml `operators`. Empty list + auth enabled means
// nobody gets in — that is a misconfiguration to fix, not "open to the internet".
export async function isAllowedEmail(email: string | null | undefined): Promise<boolean> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (process.env.ALLOWED_EMAIL) return normalized === process.env.ALLOWED_EMAIL.trim().toLowerCase();
  const { loadConfig } = await import("@/lib/data/config");
  return loadConfig().operators.includes(normalized);
}
