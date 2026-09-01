import path from "node:path";
import Link from "next/link";
import { readMarkdownIfExists } from "@/lib/data/markdown";
import { docsDir } from "@/lib/data/paths";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AiHandoffPage() {
  const content = await readMarkdownIfExists(path.join(docsDir(), "ai-handoff.md"));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/standards" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="size-3.5" /> Standards
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">AI Handoff</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The conventions this project runs on — for whoever (or whatever) picks up work here next.
        </p>
      </div>

      <Card>
        <CardContent className="px-6 py-8 sm:px-10">
          {content ? (
            <MarkdownRenderer content={content} variant="article" />
          ) : (
            <p className="text-sm text-muted-foreground">No content yet — add data/docs/ai-handoff.md.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
