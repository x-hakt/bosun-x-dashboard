import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getPortal } from "@/lib/data/clients";
import {
  listPortalProjects,
  listPortalIdeas,
  listPortalNotes,
  type PortalViewer,
} from "@/lib/portal/projection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CGB-7: a fidelity check for the operator — exactly what one client's portal
// projection returns, plus what's in the portal (Gate 1) that hasn't been
// shared with them (Gate 2). Runs the real projection functions with a
// synthetic viewer; no theming, this is a data view.
export default async function PortalPreviewPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: clientSlug } = await params;
  const client = await getClient(clientSlug);
  if (!client) notFound();
  const portal = await getPortal(client.portal);

  const asClient: PortalViewer = { kind: "client", slug: client.slug };
  const asOperator: PortalViewer = { kind: "operator" };

  const [projects, ideas, notes, allProjects, allIdeas, allNotes] = await Promise.all([
    listPortalProjects(client.portal, asClient),
    listPortalIdeas(client.portal, asClient),
    listPortalNotes(client.portal, asClient),
    listPortalProjects(client.portal, asOperator),
    listPortalIdeas(client.portal, asOperator),
    listPortalNotes(client.portal, asOperator),
  ]);

  const sharedProjectSlugs = new Set(projects.map((p) => p.slug));
  const withheldProjects = allProjects.filter((p) => !sharedProjectSlugs.has(p.slug));
  const sharedIdeaIds = new Set(ideas.map((i) => i.id));
  const withheldIdeas = allIdeas.filter((i) => !sharedIdeaIds.has(i.id));
  const withheldNotes = allNotes.length - notes.length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings/portals" className="text-xs text-muted-foreground hover:underline">
          ← Client portals
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">
          Viewing as <span className="font-mono">{client.slug}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.name} · {client.emails.join(", ")} · portal{" "}
          <span className="font-mono">{client.portal}</span>
          {portal?.url && (
            <>
              {" · "}
              <a href={portal.url} className="text-sky-400 hover:underline" target="_blank" rel="noreferrer">
                open the live portal ↗
              </a>
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {projects.length === 0 && <p className="text-xs text-muted-foreground">Nothing shared.</p>}
          {projects.map((p) => (
            <div key={p.slug} className="flex items-center justify-between gap-3 border-t border-border/50 py-1.5">
              <span>{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.status ?? p.stage}</span>
            </div>
          ))}
          {withheldProjects.length > 0 && (
            <p className="border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              In this portal but not shared with {client.slug}:{" "}
              {withheldProjects.map((p) => p.name).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ideas ({ideas.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {ideas.length === 0 && <p className="text-xs text-muted-foreground">Nothing shared.</p>}
          {ideas.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 border-t border-border/50 py-1.5">
              <span>{i.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{i.status}</span>
            </div>
          ))}
          {withheldIdeas.length > 0 && (
            <p className="border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              In this portal but not shared with {client.slug}: {withheldIdeas.map((i) => i.title).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes ({notes.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {notes.length === 0 && <p className="text-xs text-muted-foreground">Nothing shared.</p>}
          {notes.map((n, index) => (
            <div key={index} className="border-t border-border/50 py-1.5">
              {n.title}
            </div>
          ))}
          {withheldNotes > 0 && (
            <p className="border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              {withheldNotes} more note{withheldNotes === 1 ? "" : "s"} in this portal not shared with{" "}
              {client.slug}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
