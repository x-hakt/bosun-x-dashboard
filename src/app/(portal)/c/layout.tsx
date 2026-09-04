import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PORTAL_MODE } from "@/lib/portal/mode";
import { getPortalViewer, currentPortal } from "@/lib/portal/auth";
import { PortalSignOut } from "@/components/portal/portal-sign-out";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Portal shell: only rendered when the deployment is in portal mode and the
// signed-in email resolves to an operator or an invited client for this portal.
export default async function PortalLayout({ children }: LayoutProps<"/c">) {
  if (!PORTAL_MODE) notFound();

  const [viewer, portal] = await Promise.all([getPortalViewer(), currentPortal()]);
  if (!viewer) redirect("/login");
  if (!portal) notFound(); // BOSUN_PORTAL doesn't match any portal in clients.yml

  const t = portal.theme ?? {};
  const themeVars = {
    "--portal-accent": t.accent ?? "#5b8def",
    "--portal-accent-strong": t.accent_strong ?? t.accent ?? "#3f6fd1",
    "--portal-paper": t.paper ?? "#0f1420",
    "--portal-ink": t.ink ?? "#e6ecf5",
    "--portal-heading-font": t.heading_font ?? "system-ui, sans-serif",
    "--portal-body-font": t.body_font ?? "system-ui, sans-serif",
  } as React.CSSProperties;

  const nav = [
    { href: "/c", label: "Projects" },
    { href: "/c/ideas", label: "Ideas" },
    { href: "/c/notes", label: "Notes" },
  ];

  return (
    <div style={themeVars} className="min-h-full">
      <div className="min-h-screen bg-[var(--portal-paper)] text-[var(--portal-ink)] font-[var(--portal-body-font)]">
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {t.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo_url} alt="" className="h-7 w-auto" />
              ) : null}
              <span className="font-semibold tracking-tight font-[var(--portal-heading-font)]">
                {t.brand_name ?? portal.name}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {viewer.kind === "operator" && (
                <span className="text-[10px] font-mono uppercase rounded bg-white/10 px-1.5 py-0.5">operator preview</span>
              )}
              <PortalSignOut />
            </div>
          </div>
          <nav className="mx-auto max-w-4xl px-5 flex gap-5 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="py-2 border-b-2 border-transparent hover:border-[var(--portal-accent)]">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
