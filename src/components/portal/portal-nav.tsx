"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/c", label: "Projects" },
  { href: "/c/ideas", label: "Ideas" },
  { href: "/c/notes", label: "Notes" },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="pt-nav">
      {NAV.map((n) => {
        const active = n.href === "/c" ? pathname === "/c" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className="pt-nav__link" aria-current={active ? "page" : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
