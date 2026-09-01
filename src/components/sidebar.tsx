"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  FolderKanban,
  Compass,
  Server,
  ShieldCheck,
  DatabaseBackup,
  BookOpen,
  Laptop,
  HardDrive,
  Lightbulb,
  ClipboardList,
  Sparkles,
  GraduationCap,
  StickyNote,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { projectStatusAccent } from "@/lib/status-colors";

type NavProject = { slug: string; name: string; status?: string };
type NavHost = { id: string; name: string; workstation: boolean };

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: FolderKanban, projectNav: true as const },
  {
    href: "/planning",
    label: "Planning",
    icon: Compass,
    children: [
      { href: "/planning?status=idea", label: "Idea", icon: Lightbulb },
      { href: "/planning?status=planning", label: "Planning", icon: ClipboardList },
      { href: "/planning?status=ready", label: "Ready", icon: Sparkles },
      { href: "/planning?status=graduated", label: "Graduated", icon: GraduationCap },
      { href: "/planning/notes", label: "Notes", icon: StickyNote },
    ],
  },
  { href: "/servers", label: "Servers", icon: Server, hostNav: true as const },
  { href: "/backups", label: "Backups", icon: DatabaseBackup },
  {
    href: "/standards",
    label: "Standards",
    icon: ShieldCheck,
    children: [
      { href: "/standards/ai-handoff", label: "AI Handoff", icon: BookOpen },
      { href: "/standards/workstation-setup", label: "Workstation setup", icon: Laptop },
    ],
  },
];

// Status groups shown under Projects, in this order; anything else falls under "Other".
const STATUS_ORDER = ["Live", "Development", "Paused", "Abandoned"];

// A child href may carry a query string (e.g. "/planning?status=idea") to filter within
// a shared route rather than navigating to a distinct page — pathname alone can't tell
// those apart, so active-detection splits the href and additionally compares search params.
function isChildActive(childHref: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [base, query] = childHref.split("?");
  if (!pathname.startsWith(base)) return false;
  if (!query) return true;
  const expected = new URLSearchParams(query);
  for (const [key, value] of expected) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

const childLinkClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 px-2 py-1 rounded-md text-xs font-mono transition-colors",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
  );

function ProjectNav({ projects, pathname, searchParams }: { projects: NavProject[]; pathname: string; searchParams: URLSearchParams }) {
  const groups = new Map<string, NavProject[]>();
  for (const project of projects) {
    const key = project.status ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(project);
  }
  const orderedKeys = [
    ...STATUS_ORDER.filter((status) => groups.has(status)),
    ...[...groups.keys()].filter((key) => !STATUS_ORDER.includes(key)).sort(),
  ];
  const statusFilter = searchParams.get("status");

  return (
    <div className="ml-4 mt-1 space-y-2.5 border-l border-border/60 pl-2">
      {orderedKeys.map((key) => {
        const group = groups.get(key)!.slice().sort((a, b) => a.name.localeCompare(b.name));
        const groupActive = pathname === "/projects" && statusFilter === key;
        const accent = projectStatusAccent(key);
        return (
          <div key={key}>
            <Link
              href={`/projects?status=${encodeURIComponent(key)}`}
              className={cn(
                "flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors",
                accent.text,
                groupActive ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span>{key}</span>
              <span className="opacity-50">{group.length}</span>
            </Link>
            <div className={cn("mt-1 ml-1.5 space-y-0.5 border-l pl-2.5", accent.border)}>
              {group.map((project) => {
                const href = `/projects/${project.slug}`;
                return (
                  <Link key={project.slug} href={href} className={childLinkClass(pathname === href)}>
                    <span className="truncate">{project.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SidebarInner({ projects, hosts }: { projects: NavProject[]; hosts: NavHost[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hostChildren = hosts.map((h) => ({
    href: `/servers/${h.id}`,
    label: h.name,
    icon: h.workstation ? Laptop : HardDrive,
  }));

  return (
    <aside className="w-56 shrink-0 h-full border-r border-border/60 bg-sidebar flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-border/60">
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
          <span className="text-muted-foreground">▸</span> BOSUN-X
        </span>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto themed-scrollbar">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-mono transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>

              {item.projectNav && active && (
                <ProjectNav projects={projects} pathname={pathname} searchParams={searchParams} />
              )}

              {(item.children || (item.hostNav && hostChildren.length > 0)) && active && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/60 pl-2.5">
                  {(item.children ?? hostChildren).map((child) => {
                    const ChildIcon = child.icon;
                    return (
                      <Link key={child.href} href={child.href} className={childLinkClass(isChildActive(child.href, pathname, searchParams))}>
                        <ChildIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border/60 p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-mono transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
          )}
        >
          <Settings className="size-4 shrink-0" strokeWidth={1.75} />
          Settings
        </Link>
      </div>
    </aside>
  );
}

// useSearchParams() requires a Suspense boundary around any component that calls it
// (Next.js build-time requirement) — the sidebar renders in the root layout, on every
// page, so this wraps it right at the export rather than requiring every consumer to
// remember to.
export function Sidebar({ projects, hosts }: { projects: NavProject[]; hosts: NavHost[] }) {
  return (
    <Suspense fallback={<aside className="w-56 shrink-0 h-full border-r border-border/60 bg-sidebar" />}>
      <SidebarInner projects={projects} hosts={hosts} />
    </Suspense>
  );
}
