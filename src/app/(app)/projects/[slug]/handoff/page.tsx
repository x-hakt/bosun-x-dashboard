import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { displayName } from "@/lib/data/project-display";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HandoffHistoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const project = await getProject(slug);
  if (!project?.docs.handoff) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/projects/${slug}#handoff-log`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {displayName(project.meta)}
      </Link>
      <Card>
        <CardHeader><CardTitle className="text-base">Full handoff history</CardTitle></CardHeader>
        <CardContent><MarkdownRenderer content={project.docs.handoff} /></CardContent>
      </Card>
    </div>
  );
}
