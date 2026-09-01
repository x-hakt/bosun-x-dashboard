import Link from "next/link";
import { listProjects } from "@/lib/data/projects";
import { loadStandards, evaluateStandardsForProject } from "@/lib/data/standards";
import { displayName } from "@/lib/data/project-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X, Minus, BookOpen, Laptop } from "lucide-react";

const STANDARD_GUIDE = [
  { title: "Git Repo", files: ".git", body: "Version history exists locally, so changes can be reviewed and recovered." },
  { title: "Git Remote", files: "Git configuration", body: "The repository has an off-box destination for backup and collaboration." },
  { title: "Agent Context", files: "AGENTS.md / CLAUDE.md", body: "Project-specific commands, boundaries and operating instructions for Codex and Claude." },
  { title: "Spec", files: "SPEC.md", body: "Durable product intent: purpose, scope, architecture, constraints and what correct means." },
  { title: "Handoff", files: "HANDOFF.yml / HANDOFF.md", body: "A bounded current resume snapshot plus the historical cross-agent audit trail." },
];

export const dynamic = "force-dynamic";

export default async function StandardsPage() {
  const [projects, checks] = await Promise.all([listProjects(), loadStandards()]);
  const rows = await Promise.all(
    projects.map(async (project) => ({
      project,
      results: await evaluateStandardsForProject(project, checks),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Standards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {checks.length} check{checks.length === 1 ? "" : "s"} scored across every tracked project.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/standards/ai-handoff"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-3 py-1.5 transition-colors"
          >
            <BookOpen className="size-3.5" /> AI Handoff
          </Link>
          <Link
            href="/standards/workstation-setup"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-3 py-1.5 transition-colors"
          >
            <Laptop className="size-3.5" /> Workstation setup
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {STANDARD_GUIDE.map((item) => (
          <Card key={item.title}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{item.title}</CardTitle></CardHeader>
            <CardContent>
              <p className="font-mono text-[11px] text-sky-400 mb-2">{item.files}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  {checks.map((c) => (
                    <TableHead key={c.id} className="text-center whitespace-nowrap font-mono text-xs">
                      {c.label ?? c.id}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ project, results }) => (
                  <TableRow key={project.meta.slug}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/projects/${project.meta.slug}`} prefetch={false} className="hover:underline">
                        {displayName(project.meta)}
                      </Link>
                      {project.meta.vendored && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-sans">(vendored)</span>
                      )}
                    </TableCell>
                    {results.map((r) => (
                      <TableCell key={r.id} className="text-center" title={r.detail}>
                        {r.status === "pass" && <Check className="size-4 text-emerald-400 inline" />}
                        {r.status === "fail" && <X className="size-4 text-destructive inline" />}
                        {r.status === "na" && <Minus className="size-4 text-muted-foreground/50 inline" />}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registry</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="w-28">
                    <span className="capitalize text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {c.severity}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-sm w-40">{c.label ?? c.id}</TableCell>
                  <TableCell className="text-sm">{c.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
