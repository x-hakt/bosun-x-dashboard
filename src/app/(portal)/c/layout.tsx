import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import "../portal.css";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { getPortalViewer, currentPortal } from "@/lib/portal/auth";
import { portalHeadingFont, portalBodyFont } from "@/lib/portal/fonts";
import { portalThemeVars, googleFontsHref } from "@/lib/portal/theme";
import { portalIcons } from "@/lib/portal/theme";
import { PortalSignOut } from "@/components/portal/portal-sign-out";
import { PortalNav } from "@/components/portal/portal-nav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  if (!PORTAL_MODE) return {};
  const portal = await currentPortal();
  const t = portal?.theme ?? {};
  return {
    title: t.brand_name || portal?.name || "Client portal",
    description: t.brand_name ? `${t.brand_name} — client portal` : "Client portal",
    icons: portalIcons(t.favicon_url),
  };
}

// Portal shell: only rendered when the deployment is in portal mode and the
// signed-in email resolves to an operator or an invited client for this portal.
export default async function PortalLayout({ children }: LayoutProps<"/c">) {
  if (!PORTAL_MODE) notFound();

  const [viewer, portal] = await Promise.all([getPortalViewer(), currentPortal()]);
  if (!viewer) redirect("/login");
  if (!portal) notFound(); // BOSUN_PORTAL doesn't match any portal in clients.yml

  const t = portal.theme ?? {};
  const fontsHref = googleFontsHref(t.heading_font, t.body_font);
  const year = new Date().getFullYear();
  const brand = t.brand_name ?? portal.name;

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div className={`pt-shell ${portalHeadingFont.variable} ${portalBodyFont.variable}`} style={portalThemeVars(t)}>
        <header className="pt-header">
          <div className="pt-container pt-header__inner">
            <Link href="/c" className="pt-logo">
              {t.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo_url} alt={brand} />
              ) : (
                brand
              )}
            </Link>
            <div className="flex items-center gap-4">
              {viewer.kind === "operator" && <span className="pt-preview-badge">operator preview</span>}
              <PortalSignOut />
            </div>
          </div>
          <div className="pt-container">
            <PortalNav />
          </div>
        </header>

        <main className="pt-main">
          <div className="pt-container">{children}</div>
        </main>

        <footer className="pt-footer">
          <div className="pt-container pt-footer__inner">
            <div>
              <p className="pt-footer__brand">{brand}</p>
              {t.tagline && <p className="pt-footer__tagline">{t.tagline}</p>}
            </div>
            {t.site_url && (
              <div className="pt-footer__links">
                <a className="pt-footer__link" href={t.site_url}>
                  {t.site_url.replace(/^https?:\/\//, "")} ↗
                </a>
              </div>
            )}
            <p className="pt-footer__copy">
              © {year} {brand}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
