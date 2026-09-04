import type { Metadata } from "next";
import { signIn } from "@/auth";
import { configuredProviders } from "@/lib/auth-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { currentPortal } from "@/lib/portal/auth";
import { portalHeadingFont, portalBodyFont } from "@/lib/portal/fonts";
import { portalThemeVars, googleFontsHref, portalIcons } from "@/lib/portal/theme";
import "../(portal)/portal.css";

// configuredProviders() reads process.env, which is only correct at request time —
// a statically prerendered login page bakes in whatever it was at build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!PORTAL_MODE) return {};
  const t = (await currentPortal())?.theme ?? {};
  return {
    title: t.brand_name ? `Sign in · ${t.brand_name}` : "Sign in",
    icons: portalIcons(t.favicon_url),
  };
}

export default async function LoginPage() {
  const providers = configuredProviders();
  const portal = PORTAL_MODE ? await currentPortal() : null;

  if (!portal) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="w-full max-w-sm">
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
      </div>
    );
  }

  const t = portal.theme ?? {};
  const brand = t.brand_name ?? portal.name;
  const fontsHref = googleFontsHref(t.heading_font, t.body_font);

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div
        className={`pt-shell pt-login ${portalHeadingFont.variable} ${portalBodyFont.variable}`}
        style={portalThemeVars(t)}
      >
        <div className="pt-login__card text-center">
          {t.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} alt={brand} className="mx-auto" style={{ height: "2.25rem", width: "auto" }} />
          ) : (
            <p className="pt-login__logo">{brand}</p>
          )}
          <p className="pt-login__sub">Client portal — sign in to continue</p>

          {providers.length > 0 ? (
            <div className="mt-7 space-y-2.5">
              {providers.map((provider) => (
                <form
                  key={provider.id}
                  action={async () => {
                    "use server";
                    await signIn(provider.id, { redirectTo: "/" });
                  }}
                >
                  <button type="submit" className="pt-cta pt-cta--block">
                    Sign in with {provider.label}
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm" style={{ color: "var(--portal-ink-soft)" }}>
              No sign-in provider is configured for this portal.
            </p>
          )}

          <p className="pt-login__note">
            Access is by invitation. If you can&rsquo;t get in, contact {brand}.
          </p>
        </div>
      </div>
    </>
  );
}
