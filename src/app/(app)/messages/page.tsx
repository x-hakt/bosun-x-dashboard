import Link from "next/link";
import { loadClientRegistry } from "@/lib/data/clients";
import { listClientThreads } from "@/lib/data/portal-messages";
import { PortalMessagesList } from "@/components/portal-messages-list";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const registry = await loadClientRegistry();
  const threads = await listClientThreads(registry.clients.map((c) => c.slug));
  const threadBySlug = new Map(threads.map((t) => [t.slug, t]));

  const clients = registry.clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    portal: c.portal,
    notes: threadBySlug.get(c.slug)?.notes ?? "",
    operatorSeen: threadBySlug.get(c.slug)?.operatorSeen ?? 0,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One direct, always-on conversation per client — separate from a project&rsquo;s or idea&rsquo;s own
          thread. Stored as <code className="font-mono text-xs">portal-messages/&lt;client&gt;/NOTES.md</code>.
        </p>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No clients yet — invite one from{" "}
          <Link href="/settings/portals" className="text-sky-400 hover:underline">
            Settings → Client portals
          </Link>
          .
        </p>
      ) : (
        <PortalMessagesList clients={clients} />
      )}
    </div>
  );
}
