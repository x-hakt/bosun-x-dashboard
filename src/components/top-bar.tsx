"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Crumb {
  label: string;
  href?: string; // omitted for the current/last segment — not a link to itself
}

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/projects": "Projects",
  "/planning": "Planning",
  "/notes": "Notes",
  "/servers": "Servers",
  "/standards": "Standards",
  "/login": "Login",
};

function crumbsFor(pathname: string): Crumb[] {
  if (TITLES[pathname]) return [{ label: TITLES[pathname] }];
  if (pathname === "/standards/ai-handoff") {
    return [{ label: "Standards", href: "/standards" }, { label: "AI Handoff" }];
  }
  if (pathname.startsWith("/projects/")) {
    const slug = pathname.split("/")[2];
    return [{ label: "Projects", href: "/projects" }, { label: slug }];
  }
  if (pathname.startsWith("/planning/")) {
    const id = pathname.split("/")[2];
    return [{ label: "Planning", href: "/planning" }, { label: id }];
  }
  if (pathname.startsWith("/servers/")) {
    const host = pathname.split("/")[2];
    return [{ label: "Servers", href: "/servers" }, { label: host }];
  }
  return [{ label: "bosun-x", href: "/" }];
}

export function TopBar() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <div className="h-11 shrink-0 flex items-center px-8 border-b border-border/60 bg-background/95">
      <div className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-border">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-foreground transition-colors">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
