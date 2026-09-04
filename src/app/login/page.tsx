import type { Metadata } from "next";
import { signIn } from "@/auth";
import { configuredProviders } from "@/lib/auth-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { currentPortal } from "@/lib/portal/auth";
import { googleFontsHref } from "@/lib/portal/theme";

// configuredProviders() reads process.env, which is only correct at request time —
// a statically prerendered login page bakes in whatever it was at build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!PORTAL_MODE) return {};
  const t = (await currentPortal())?.theme ?? {};
  return {
    title: t.brand_name ? `Sign in · ${t.brand_name}` : "Sign in",
    icons: t.favicon_url ? { icon: t.favicon_url } : undefined,
  };
}

export default async function LoginPage() {
  const providers = configuredProviders();
  const portal = PORTAL_MODE ? await currentPortal() : null;
  const t = portal?.theme ?? {};

  const themeVars = portal
    ? ({
        "--portal-accent": t.accent ?? "#5b8def",
        "--portal-accent-strong": t.accent_strong ?? t.accent ?? "#3f6fd1",
        "--portal-paper": t.paper ?? "#0f1420",
        "--portal-ink": t.ink ?? "#e6ecf5",
        "--portal-heading-font": t.heading_font ?? "var(--font-sans), system-ui, sans-serif",
      } as React.CSSProperties)
    : undefined;
  const fontsHref = portal ? googleFontsHref(t.heading_font, t.body_font) : null;

  const brand = portal ? (t.brand_name ?? portal.name) : "bosun-x";

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div
        style={themeVars}
        className={
          portal
            ? "flex items-center justify-center min-h-screen p-6 bg-[var(--portal-paper)] text-[var(--portal-ink)]"
            : "flex items-center justify-center h-full p-6"
        }
      >
        <div className="w-full max-w-sm">
          {portal ? (
            <>
              <div className="mb-6 text-center">
                {t.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo_url} alt={brand} className="mx-auto h-9 w-auto" />
                ) : (
                  <h1
                    className="text-2xl font-semibold tracking-tight"
                    style={{ fontFamily: "var(--portal-heading-font)" }}
                  >
                    {brand}
                  </h1>
                )}
                <p className="mt-1 text-sm text-[var(--portal-ink)]/60">Client portal</p>
              </div>
              {providers.length > 0 ? (
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <form
                      key={provider.id}
                      action={async () => {
                        "use server";
                        await signIn(provider.id, { redirectTo: "/" });
                      }}
                    >
                      <button
                        type="submit"
                        className="w-full rounded-md bg-[var(--portal-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--portal-accent-strong)]"
                      >
                        Sign in with {provider.label}
                      </button>
                    </form>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--portal-ink)]/60">
                  No sign-in provider is configured for this portal.
                </p>
              )}
              <p className="mt-6 text-center text-[11px] text-[var(--portal-ink)]/40">
                Access is by invitation. If you can&rsquo;t get in, contact {brand}.
              </p>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="text-muted-foreground">▸</span> bosun-x
                </CardTitle>
              </CardHeader>
              <CardContent>
                {providers.length > 0 ? (
                  <div className="space-y-2">
                    {providers.map((provider) => (
                      <form
                        key={provider.id}
                        action={async () => {
                          "use server";
                          await signIn(provider.id, { redirectTo: "/" });
                        }}
                      >
                        <Button type="submit" className="w-full">
                          Sign in with {provider.label}
                        </Button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No sign-in provider is configured — the dashboard is open. See docs/auth.md to add one.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
