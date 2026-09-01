import path from "node:path";
import { readMarkdownIfExists } from "@/lib/data/markdown";
import { importedDir } from "@/lib/data/paths";
import { readInboxNote } from "@/lib/actions/notes";
import { listPlanningTasks } from "@/lib/data/planning";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { InboxEditor } from "@/components/inbox-editor";
import { NewPlanningItemForm } from "@/components/new-planning-item-form";
import { PlanningTaskRow } from "@/components/planning-task-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PlanningNotesPage() {
  const [coolWebsites, inbox, all] = await Promise.all([
    readMarkdownIfExists(path.join(importedDir(), "cool-websites.md")),
    readInboxNote(),
    listPlanningTasks(),
  ]);
  const notes = all.filter((t) => t.meta.type === "note");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Notes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Freeform scratch space, reference bookmarks, and one-off items that were never meant to become a project
          — not part of the idea → planning → ready → graduated lifecycle.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <InboxEditor initialContent={inbox} />
          </CardContent>
        </Card>

        {coolWebsites && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cool websites</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownRenderer content={coolWebsites} />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standalone notes ({notes.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes.length > 0 && (
            <div className="space-y-1.5">
              {notes.map((t) => (
                <PlanningTaskRow key={t.meta.id} task={t.meta} />
              ))}
            </div>
          )}
          <NewPlanningItemForm kind="note" />
        </CardContent>
      </Card>
    </div>
  );
}
