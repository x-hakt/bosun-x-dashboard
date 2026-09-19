"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";

interface MobileNavContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

// Shared open/closed state for the mobile sidebar drawer — Sidebar (the
// drawer content + trigger-target) and TopBar (the hamburger trigger) are
// rendered as siblings inside the server-component AppLayout, so a context
// is the simplest way for them to coordinate without prop-threading through
// a server component on every route.
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // "Adjusting state when a prop changes" pattern (React docs) rather than an
  // effect — closes the drawer on navigation without an extra render pass or
  // tripping the no-setState-in-effect lint rule.
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [open, setOpen] = useState(false);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within a MobileNavProvider");
  return ctx;
}
