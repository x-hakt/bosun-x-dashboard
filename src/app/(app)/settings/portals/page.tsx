import Link from "next/link";
import { loadClientRegistry } from "@/lib/data/clients";
import { clientsFile } from "@/lib/data/paths";
import { PORTAL_THEME_KEYS, type PortalThemeKey } from "@/lib/portal-admin-edit";
import { PortalAdmin, type PortalView, type ClientView } from "@/components/portal-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalsSettingsPage() {
  const registry = await loadClientRegistry();

  const portals: PortalView[] = registry.portals.map((p) => {
    const theme: Partial<Record<PortalThemeKey, string>> = {};
    for (const key of PORTAL_THEME_KEYS) {
      const value = p.theme?.[key];
      if (typeof value === "string" && value) theme[key] = value;
    }
    return { slug: p.slug, name: p.name, url: p.url, theme };
  });

  const clients: ClientView[] = registry.clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    portal: c.portal,
    emails: c.emails,
    note: c.note,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
          ← Settings
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Client portals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portals are the branded surfaces clients sign into; clients are the people invited into one. A
          project, idea or note only appears in a portal when it carries both{" "}
          <code className="font-mono text-xs">portals: [slug]</code> (set from each item&rsquo;s{" "}
          <span className="font-medium">Client portal</span> control) and{" "}
          <code className="font-mono text-xs">shared_with: [client]</code>. Saved to{" "}
          <code className="font-mono text-xs">{clientsFile()}</code>; the portal deployment picks changes up on
          its next request.
        </p>
      </div>

      <PortalAdmin portals={portals} clients={clients} />
    </div>
  );
}
