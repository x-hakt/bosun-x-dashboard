"use client";

import { usePathname } from "next/navigation";

// Keying on pathname forces a remount on every navigation between projects (or to/from
// the bare list), which restarts the CSS-driven slide/fade so it plays on each switch,
// not just the first time.
export function DetailPanel({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-in fade-in duration-200 ease-out">
      {children}
    </div>
  );
}
