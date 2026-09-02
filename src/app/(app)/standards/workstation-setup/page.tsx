import path from "node:path";
import Link from "next/link";
import { readMarkdownIfExists } from "@/lib/data/markdown";
import { docsDir } from "@/lib/data/paths";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WorkstationSetupPage() {
  const content = await readMarkdownIfExists(path.join(docsDir(), "workstation-setup.md"));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/standards" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="size-3.5" /> Standards
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Workstation setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          An optional doc slot for how you bootstrap a new machine to work on these projects
          — reads from <code className="font-mono text-xs">data/docs/workstation-setup.md</code>.
        </p>
      </div>

      <Card>
        <CardContent className="px-6 py-8 sm:px-10">
          {content ? (
            <MarkdownRenderer content={content} variant="article" />
          ) : (
            <p className="text-sm text-muted-foreground">No content yet — add data/docs/workstation-setup.md.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
