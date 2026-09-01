import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { displayName } from "@/lib/data/project-display";
import { readProjectDocument, type ProjectDocumentKind } from "@/lib/data/project-documents";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProjectDocumentPage(props: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await props.params;
  if (kind !== "spec" && kind !== "agent") notFound();
  const project = await getProject(slug);
  if (!project) notFound();
  const canonical = await readProjectDocument(project, kind as ProjectDocumentKind);
  const document = canonical ?? (kind === "spec" && project.docs.spec
    ? { filename: "bosun-x record / SPEC.md", content: project.docs.spec }
    : null);
  const title = kind === "spec" ? "Specification" : "Agent context";

  return (
    <div className="space-y-4">
      <Link href={`/projects/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {displayName(project.meta)}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {document && <p className="font-mono text-xs text-muted-foreground">Canonical source · {document.filename}</p>}
        </CardHeader>
        <CardContent>
          {document
            ? <MarkdownRenderer content={document.content} variant="article" />
            : <p className="text-sm text-muted-foreground">No readable canonical {title.toLowerCase()} file is available.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
