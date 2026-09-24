"use client";

import { Suspense, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMobileNav } from "@/components/mobile-nav-context";
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
  StickyNote,
  ChevronRight,
  MessageSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { projectStatusAccent, planningStatusAccent } from "@/lib/status-colors";
import { useStoredFlags, readStoredFlags } from "@/lib/hooks/use-stored-flags";

type NavProject = { slug: string; name: string; status?: string };
type NavIdea = { id: string; title: string; status: string };
type NavHost = { id: string; name: string; workstation: boolean };

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: FolderKanban, projectNav: true as const },
  { href: "/planning", label: "Planning", icon: Compass, planningNav: true as const },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/messages", label: "Messages", icon: MessageSquare },
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
// Same idea for Planning (BXD-56): the idea lifecycle, in order.
const PLANNING_STATUS_ORDER = ["idea", "planning", "ready", "graduated"];

// BXD-59: which sections are expanded is independent of which one is active, so
// Projects and Planning (say) can both stay open. Remembered per browser.
const NAV_OPEN_KEY = "bosun-x:nav-open";

function sectionActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

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

// BXD-56: Planning mirrors Projects: coloured status sub-headings (each a link to
// that status filter) with the top-level ideas listed beneath. Sub-ideas follow
// their parent's status (BXD-58) and live on the parent's page, so only roots show.
function PlanningNav({ ideas, pathname, searchParams }: { ideas: NavIdea[]; pathname: string; searchParams: URLSearchParams }) {
  const groups = new Map<string, NavIdea[]>();
  for (const idea of ideas) {
    if (!groups.has(idea.status)) groups.set(idea.status, []);
    groups.get(idea.status)!.push(idea);
  }
  const orderedKeys = PLANNING_STATUS_ORDER.filter((status) => groups.has(status));
  const statusFilter = searchParams.get("status");

  return (
    <div className="ml-4 mt-1 space-y-2.5 border-l border-border/60 pl-2">
      {orderedKeys.map((key) => {
        const group = groups.get(key)!;
        const groupActive = pathname === "/planning" && statusFilter === key;
        const accent = planningStatusAccent(key);
        return (
          <div key={key}>
            <Link
              href={`/planning?status=${encodeURIComponent(key)}`}
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
              {group.map((idea) => {
                const href = `/planning/${idea.id}`;
                const active = pathname === href || pathname.startsWith(`${href}.`);
                return (
                  <Link key={idea.id} href={href} className={childLinkClass(active)} title={`${idea.id}: ${idea.title}`}>
                    <span className="truncate">{idea.title}</span>
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

// Explicit open/closed choices, keyed by section href (see useStoredFlags). A section
// with no explicit choice is open exactly when it's the active one.
function useNavOpen(pathname: string) {
  const activeSection = NAV.find((item) => item.href !== "/" && sectionActive(item.href, pathname))?.href;
  const { flags: explicit, set } = useStoredFlags(NAV_OPEN_KEY);

  // Landing in a section with no explicit choice records it as open, so it stays
  // open after navigating somewhere else (opening one never closes another).
  // Reads storage fresh: during hydration `explicit` is still the server snapshot.
  useEffect(() => {
    if (activeSection && readStoredFlags(NAV_OPEN_KEY)[activeSection] === undefined) set(activeSection, true);
  }, [activeSection, explicit, set]);

  const isOpen = useCallback((href: string) => explicit[href] ?? href === activeSection, [explicit, activeSection]);
  const toggle = useCallback((href: string) => set(href, !isOpen(href)), [isOpen, set]);
  // Clicking a section's label opens it (and never closes any other section).
  const expand = useCallback((href: string) => set(href, true), [set]);

  return { isOpen, toggle, expand };
}

// Shared between the desktop static <aside> and the mobile Sheet drawer —
// same nav content either way, just a different outer container.
function SidebarContent({
  projects,
  ideas,
  hosts,
  unreadMessages,
  nav,
}: {
  projects: NavProject[];
  ideas: NavIdea[];
  hosts: NavHost[];
  unreadMessages: number;
  nav: ReturnType<typeof useNavOpen>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hostChildren = hosts.map((h) => ({
    href: `/servers/${h.id}`,
    label: h.name,
    icon: h.workstation ? Laptop : HardDrive,
  }));

  return (
    <>
      <div className="h-14 shrink-0 flex items-center px-4 border-b border-border/60">
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
          <span className="text-muted-foreground">▸</span> BOSUN-X
        </span>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto themed-scrollbar">
        {NAV.map((item) => {
          const active = sectionActive(item.href, pathname);
          const Icon = item.icon;
          const expandable = Boolean(
            ("projectNav" in item && item.projectNav) ||
              ("planningNav" in item && item.planningNav) ||
              ("children" in item && item.children) ||
              ("hostNav" in item && item.hostNav && hostChildren.length > 0),
          );
          const expanded = expandable && nav.isOpen(item.href);
          return (
            <div key={item.href}>
              <div
                className={cn(
                  "flex items-center rounded-md transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                <Link
                  href={item.href}
                  onClick={() => expandable && nav.expand(item.href)}
                  className="flex flex-1 min-w-0 items-center gap-2.5 px-2.5 py-1.5 text-sm font-mono"
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  {item.label}
                  {item.href === "/messages" && unreadMessages > 0 && (
                    <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      {unreadMessages}
                    </span>
                  )}
                </Link>
                {expandable && (
                  <button
                    type="button"
                    onClick={() => nav.toggle(item.href)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                    className="mr-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} strokeWidth={2} />
                  </button>
                )}
              </div>

              {"projectNav" in item && item.projectNav && expanded && (
                <ProjectNav projects={projects} pathname={pathname} searchParams={searchParams} />
              )}

              {"planningNav" in item && item.planningNav && expanded && (
                <PlanningNav ideas={ideas} pathname={pathname} searchParams={searchParams} />
              )}

              {(("children" in item && item.children) || ("hostNav" in item && item.hostNav && hostChildren.length > 0)) && expanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/60 pl-2.5">
                  {(("children" in item && item.children) || hostChildren).map((child) => {
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

      <div className="border-t border-border/60 p-2 shrink-0">
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
    </>
  );
}

function SidebarInner(props: { projects: NavProject[]; ideas: NavIdea[]; hosts: NavHost[]; unreadMessages: number }) {
  const { open, setOpen } = useMobileNav();
  const nav = useNavOpen(usePathname());

  return (
    <>
      {/* Desktop: statically visible, unchanged from before. */}
      <aside className="hidden md:flex w-56 shrink-0 h-full border-r border-border/60 bg-sidebar flex-col">
        <SidebarContent {...props} nav={nav} />
      </aside>

      {/* Mobile: off-canvas drawer, toggled by the hamburger button in TopBar. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SidebarContent {...props} nav={nav} />
        </SheetContent>
      </Sheet>
    </>
  );
}

// useSearchParams() requires a Suspense boundary around any component that calls it
// (Next.js build-time requirement) — the sidebar renders in the root layout, on every
// page, so this wraps it right at the export rather than requiring every consumer to
// remember to.
export function Sidebar({
  projects,
  ideas = [],
  hosts,
  unreadMessages = 0,
}: {
  projects: NavProject[];
  ideas?: NavIdea[];
  hosts: NavHost[];
  unreadMessages?: number;
}) {
  return (
    <Suspense fallback={<aside className="hidden md:flex w-56 shrink-0 h-full border-r border-border/60 bg-sidebar" />}>
      <SidebarInner projects={projects} ideas={ideas} hosts={hosts} unreadMessages={unreadMessages} />
    </Suspense>
  );
}
