"use client";

import { useEffect } from "react";
import { markPortalSeen } from "@/lib/portal/reply";

// CGB-9: stamps the client's visit once the home page (with its "since your last
// visit" digest) has rendered, so the next visit diffs from now. Fire-and-forget.
export function PortalSeenBeacon() {
  useEffect(() => {
    const t = setTimeout(() => {
      markPortalSeen().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
