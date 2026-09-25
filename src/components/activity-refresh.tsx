"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ActivityRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) router.refresh(); }, 10000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
