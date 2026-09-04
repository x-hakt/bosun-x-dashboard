"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/c", label: "Projects" },
  { href: "/c/ideas", label: "Ideas" },
  { href: "/c/notes", label: "Notes" },
  { href: "/c/messages", label: "Messages" },
];

// One row, laid out exactly like cgburchell.com's .site-header__inner — wordmark
// left, nav (links + CTA) right. The glass panel only fades in once the page is
// scrolled, same as .site-header.scrolled. signOut is the server-rendered
// <PortalSignOut> passed down from the layout.
export function PortalHeader({
  brand,
  logoUrl,
  operatorPreview,
  signOut,
}: {
  brand: string;
  logoUrl?: string;
  operatorPreview: boolean;
  signOut: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pt-header" data-scrolled={scrolled}>
      <div className="pt-container pt-header__inner">
        <Link href="/c" className="pt-logo">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brand} />
          ) : (
            brand
          )}
        </Link>
        <nav className="pt-nav">
          {NAV.map((n) => {
            const active = n.href === "/c" ? pathname === "/c" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="pt-nav__link"
                aria-current={active ? "page" : undefined}
              >
                {n.label}
              </Link>
            );
          })}
          {operatorPreview && <span className="pt-preview-badge">operator preview</span>}
          {signOut}
        </nav>
      </div>
    </header>
  );
}
