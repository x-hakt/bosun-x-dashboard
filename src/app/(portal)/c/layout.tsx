import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { getPortalViewer, currentPortal } from "@/lib/portal/auth";
import { PortalSignOut } from "@/components/portal/portal-sign-out";
import { googleFontsHref, portalIcons } from "@/lib/portal/theme";

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
  const themeVars = {
    "--portal-accent": t.accent ?? "#5b8def",
    "--portal-accent-strong": t.accent_strong ?? t.accent ?? "#3f6fd1",
    "--portal-paper": t.paper ?? "#0f1420",
    "--portal-ink": t.ink ?? "#e6ecf5",
    "--portal-heading-font": t.heading_font ?? "var(--font-sans), system-ui, sans-serif",
    "--portal-body-font": t.body_font ?? "var(--font-sans), system-ui, sans-serif",
  } as React.CSSProperties;

  const nav = [
    { href: "/c", label: "Projects" },
    { href: "/c/ideas", label: "Ideas" },
    { href: "/c/notes", label: "Notes" },
  ];
  const year = new Date().getFullYear();

  return (
    <>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div
        style={themeVars}
        className="min-h-screen flex flex-col bg-[var(--portal-paper)] text-[var(--portal-ink)]"
      >
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-4xl px-5 h-16 flex items-center justify-between">
            <Link href="/c" className="flex items-center gap-2.5">
              {t.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo_url} alt={t.brand_name ?? portal.name} className="h-7 w-auto" />
              ) : (
                <span
                  className="text-lg font-semibold tracking-tight"
                  style={{ fontFamily: "var(--portal-heading-font)" }}
                >
                  {t.brand_name ?? portal.name}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-4 text-sm">
              {viewer.kind === "operator" && (
                <span className="text-[10px] font-mono uppercase rounded bg-white/10 px-1.5 py-0.5 text-[var(--portal-ink)]/70">
                  operator preview
                </span>
              )}
              <PortalSignOut />
            </div>
          </div>
          <nav className="mx-auto max-w-4xl px-5 flex gap-6 text-[13px]">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="py-2.5 -mb-px border-b-2 border-transparent text-[var(--portal-ink)]/70 hover:text-[var(--portal-ink)] hover:border-[var(--portal-accent)] transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>

        <main
          className="mx-auto w-full max-w-4xl px-5 py-9 flex-1"
          style={{ fontFamily: "var(--portal-body-font)" }}
        >
          {children}
        </main>

        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-4xl px-5 py-6 flex flex-wrap items-end justify-between gap-3 text-xs text-[var(--portal-ink)]/50">
            <div>
              <p className="text-[var(--portal-ink)]/80" style={{ fontFamily: "var(--portal-heading-font)" }}>
                {t.brand_name ?? portal.name}
              </p>
              {t.tagline && <p className="mt-0.5">{t.tagline}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              {t.site_url && (
                <a href={t.site_url} className="hover:text-[var(--portal-ink)]">
                  {t.site_url.replace(/^https?:\/\//, "")} ↗
                </a>
              )}
              <p>
                © {year} {t.brand_name ?? portal.name}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
