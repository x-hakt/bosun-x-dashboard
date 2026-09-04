"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { PortalNav } from "@/components/portal/portal-nav";

// The glass panel only appears once the page is scrolled — same as
// cgburchell.com's .site-header.scrolled. signOut is the server-rendered
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
        <div className="flex items-center gap-4">
          {operatorPreview && <span className="pt-preview-badge">operator preview</span>}
          {signOut}
        </div>
      </div>
      <div className="pt-container">
        <PortalNav />
      </div>
    </header>
  );
}
