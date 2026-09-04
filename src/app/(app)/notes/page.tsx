import { loadNotes } from "@/lib/data/notes";
import { loadClientRegistry } from "@/lib/data/clients";
import { NotesList } from "@/components/notes-list";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [notes, registry] = await Promise.all([loadNotes(), loadClientRegistry()]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Notes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Things to remember or come back to — not things to get done. Each note has a running body you can
          add to over time; pin the ones that matter. Stored as <code className="font-mono text-xs">notes.yml</code>.
        </p>
      </div>

      <NotesList
        notes={notes}
        portals={registry.portals.map((p) => ({ slug: p.slug, name: p.name }))}
        clients={registry.clients.map((c) => ({ slug: c.slug, name: c.name, portal: c.portal }))}
      />
    </div>
  );
}
