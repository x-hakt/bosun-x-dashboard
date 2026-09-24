import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { BackupAlertBanner } from "@/components/backup-alert-banner";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { listProjects } from "@/lib/data/projects";
import { listPlanningTasks } from "@/lib/data/planning";
import { loadHosts } from "@/lib/data/hosts";
import { loadClientRegistry } from "@/lib/data/clients";
import { unseenClientMessageTotal } from "@/lib/data/portal-messages";
import { displayName } from "@/lib/data/project-display";

// Everything except /login renders inside this: the sidebar + top bar chrome.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Local file reads for ~20 project.yml files — fast, and the sidebar needs the list
  // on every page now that projects live in the nav rather than a per-route column.
  const [projectList, hostList, clientRegistry, planningList] = await Promise.all([
    listProjects(),
    loadHosts(),
    loadClientRegistry(),
    listPlanningTasks(),
  ]);
  const unreadMessages = await unseenClientMessageTotal(clientRegistry.clients.map((c) => c.slug));
  const projects = projectList.map((p) => ({
    slug: p.meta.slug,
    name: displayName(p.meta),
    status: p.meta.status,
  }));
  // Top-level ideas only (plus orphans whose parent is gone), numerically by id.
  const planningIds = new Set(planningList.map((t) => t.meta.id));
  const ideas = planningList
    .filter((t) => !t.meta.parent || !planningIds.has(t.meta.parent))
    .map((t) => ({ id: t.meta.id, title: t.meta.title, status: t.meta.status }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const hosts = hostList.map((h) => ({ id: h.id, name: h.name, workstation: h.role === "workstation" }));

  return (
    <MobileNavProvider>
      <div className="h-full flex overflow-hidden">
        <Sidebar projects={projects} ideas={ideas} hosts={hosts} unreadMessages={unreadMessages} />
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <TopBar />
          <main className="flex-1 min-w-0 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
            <Suspense fallback={null}>
              <BackupAlertBanner />
            </Suspense>
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
