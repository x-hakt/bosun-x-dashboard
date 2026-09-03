import { notFound } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/data/projects";
import { loadStandards, evaluateStandardsForProject } from "@/lib/data/standards";
import { loadTasks } from "@/lib/data/tasks";
import { taskPrefix } from "@/lib/data/task-key";
import { getContainersForProject } from "@/lib/infra/project-host";
import { getContainerRefs, displayName } from "@/lib/data/project-display";
import { computeContainerStatus } from "@/lib/checks/container-status";
import { resolveCheckTarget } from "@/lib/checks/target";
import { ContainerStatusBadge } from "@/components/container-status-badge";
import { ProjectStatusEditor } from "@/components/project-status-editor";
import { ProjectOverviewEditor } from "@/components/project-overview-editor";
import { ProjectTitle } from "@/components/project-title";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProjectStandards, type ProjectStandardRow } from "@/components/project-standards";
import { ProjectContainers } from "@/components/project-containers";
import { ProjectBackups } from "@/components/project-backups";
import { getBackupStatus } from "@/lib/data/backup-status";
import { loadBackups, loadDestinations } from "@/lib/data/backups";
import { readBackupLog, readRestoreLog, readLiveRestoreReceipt } from "@/lib/data/backup-log";
import { liveRestorePending } from "@/lib/data/backup-request";
import { backupRequestPending, restoreTestPending } from "@/lib/data/backup-request";
import { TaskList } from "@/components/task-list";
import { HandoffLog } from "@/components/handoff-log";
import { HandoffStatus } from "@/components/handoff-status";
import { NeedsReviewIndicator } from "@/components/needs-review-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const project = await getProject(slug);
  if (!project) notFound();

  const { meta, docs } = project;

  // Can the dashboard get real git/file facts for this project at all? True for local-host
  // (local FS) and for hosts reachable over the least-privilege SSH allowlist; false
  // for a host with no checking path (e.g. a workstation) or a vendored/no-path project.
  const checkTarget = await resolveCheckTarget(project);
  const checksAvailable = checkTarget.mode !== "none";

  const standards = await loadStandards();
  const [scored, tasks, { containers: liveContainers, liveMonitored: containersLiveMonitored }, backupStatus, backupPending, restorePending, backupConfig, destinations] = await Promise.all([
    evaluateStandardsForProject(project, standards),
    loadTasks(slug),
    getContainersForProject(meta.host),
    getBackupStatus(slug),
    backupRequestPending(slug),
    restoreTestPending(slug),
    loadBackups(slug),
    loadDestinations(),
  ]);

  // Per-store run history for the Backups panel (backup + restore-test *.jsonl).
  const backupLog = backupStatus?.method === "agent" ? await readBackupLog(slug, 10) : [];
  const restoreLog: Record<string, Awaited<ReturnType<typeof readRestoreLog>>> = {};
  const liveRestoreReceipts: Record<string, Awaited<ReturnType<typeof readLiveRestoreReceipt>>> = {};
  if (backupStatus?.method === "agent") {
    for (const s of backupStatus.stores) {
      restoreLog[s.name] = await readRestoreLog(slug, s.name, 8);
      liveRestoreReceipts[s.name] = await readLiveRestoreReceipt(slug, s.name);
    }
  }
  const liveRestoreIsPending = backupStatus?.method === "agent" ? await liveRestorePending(slug) : false;

  // Zip the registry definitions (which carry the human label + severity) with their
  // scored results (same order — Promise.all over `standards`). This one panel is the
  // whole standards story on the detail page; the cross-project matrix and the registry
  // definitions live on /standards.
  const standardRows: ProjectStandardRow[] = standards.map((def, i) => ({
    label: def.label ?? def.id,
    severity: def.severity,
    status: scored[i]?.status ?? "na",
    detail: scored[i]?.detail,
  }));
  const statusById = (id: string) => scored.find((r) => r.id === id)?.status;
  const hasSpec = statusById("has-spec") === "pass";
  const hasAgentContext = statusById("has-agent-context") === "pass";

  // "Overview" (STATUS.md) is always shown and always editable, even if the file doesn't
  // exist yet — it's the one doc every project should have a prose description in.
  const docsAvailable = [
    { key: "overview", label: "Overview", content: docs.status ?? "" },
    docs.spec && { key: "spec", label: "Spec", content: docs.spec },
    docs.ideas && { key: "ideas", label: "Ideas", content: docs.ideas },
  ].filter(Boolean) as { key: string; label: string; content: string }[];

  const containerRefs = getContainerRefs(meta);
  const prefix = taskPrefix(meta);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ProjectTitle slug={slug} initialName={displayName(meta)} />
            {meta.needs_review && <NeedsReviewIndicator />}
          </div>
          {meta.host && <p className="text-sm text-muted-foreground mt-1 font-mono">{meta.host} · {meta.path}</p>}
          {meta.also_on?.map((d) => (
            <p key={`${d.host}:${d.path ?? ""}`} className="text-xs text-muted-foreground/70 mt-0.5 font-mono" title={d.note}>
              also on {d.host}{d.path ? ` · ${d.path}` : ""}
            </p>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ContainerStatusBadge status={computeContainerStatus(meta, liveContainers)} />
          <ProjectStatusEditor slug={slug} status={meta.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-mono uppercase tracking-wide text-muted-foreground">Tasks</h2>
              <span className="text-xs font-mono text-muted-foreground/70">{prefix}-</span>
            </div>
            <TaskList slug={slug} prefix={prefix} tasks={tasks} />
          </section>

          <Tabs defaultValue={docsAvailable[0].key}>
            <TabsList>
              {docsAvailable.map((d) => (
                <TabsTrigger key={d.key} value={d.key}>
                  {d.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {docsAvailable.map((d) => (
              <TabsContent key={d.key} value={d.key}>
                <Card>
                  <CardContent className="pt-6">
                    {d.key === "overview" ? (
                      <ProjectOverviewEditor slug={slug} initialContent={d.content} />
                    ) : (
                      <MarkdownRenderer content={d.content} />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="space-y-4">
          <HandoffStatus state={project.handoffState} />

          {standards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Standards</CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectStandards rows={standardRows} />
                {meta.vendored ? (
                  <p className="text-xs text-muted-foreground italic mt-3">
                    Third-party/vendored software — source-development checks are n/a; its operational spec and handoff still apply.
                  </p>
                ) : !checksAvailable && meta.host ? (
                  <p className="text-xs text-muted-foreground italic mt-3">
                    File/git checks read as n/a — bosun-x has no checking path to {meta.host} yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {backupStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Backups</CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectBackups
                  status={backupStatus}
                  pending={backupPending}
                  restorePending={restorePending}
                  config={backupConfig}
                  destinations={destinations.map((d) => ({ id: d.id, kind: d.kind }))}
                  backupLog={backupLog}
                  restoreLog={restoreLog}
                  liveRestorePending={liveRestoreIsPending}
                  liveRestoreReceipts={liveRestoreReceipts}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Project documents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link href={`/projects/${slug}/docs/spec`} prefetch={false} className="block text-sky-400 hover:underline">
                SPEC.md <span className="text-xs text-muted-foreground">· {hasSpec ? "available" : "missing"}</span>
              </Link>
              <Link href={`/projects/${slug}/docs/agent`} prefetch={false} className="block text-sky-400 hover:underline">
                Agent context <span className="text-xs text-muted-foreground">· {hasAgentContext ? "available" : "missing"}</span>
              </Link>
              <a href="#handoff-log" className="block text-sky-400 hover:underline">
                Handoff history <span className="text-xs text-muted-foreground">· {docs.handoff ? "available" : "missing"}</span>
              </a>
              <p className="text-[11px] text-muted-foreground pt-1">Contents load only when opened, never during general browsing.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Host &amp; containers</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectContainers refs={containerRefs} liveContainers={liveContainers} liveMonitored={containersLiveMonitored} />
            </CardContent>
          </Card>

          {((meta.links && meta.links.length > 0) || meta.error_tracking_url) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {meta.links?.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="block text-sky-400 hover:underline">
                    {l.label}
                  </a>
                ))}
                {meta.error_tracking_url && (
                  <a href={meta.error_tracking_url} target="_blank" rel="noopener noreferrer" className="block text-sky-400 hover:underline">
                    Error tracker ↗
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {docs.handoff && (
        <Card id="handoff-log">
          <CardHeader>
            <CardTitle className="text-base">Handoff log</CardTitle>
          </CardHeader>
          <CardContent>
            <HandoffLog content={docs.handoff} slug={slug} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
