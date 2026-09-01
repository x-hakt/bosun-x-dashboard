import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { listProjects } from "@/lib/data/projects";
import { loadHosts } from "@/lib/data/hosts";
import { displayName } from "@/lib/data/project-display";

// Everything except /login renders inside this: the sidebar + top bar chrome.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Local file reads for ~20 project.yml files — fast, and the sidebar needs the list
  // on every page now that projects live in the nav rather than a per-route column.
  const [projectList, hostList] = await Promise.all([listProjects(), loadHosts()]);
  const projects = projectList.map((p) => ({
    slug: p.meta.slug,
    name: displayName(p.meta),
    status: p.meta.status,
  }));
  const hosts = hostList.map((h) => ({ id: h.id, name: h.name, workstation: h.role === "workstation" }));

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar projects={projects} hosts={hosts} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        <main className="flex-1 min-w-0 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
