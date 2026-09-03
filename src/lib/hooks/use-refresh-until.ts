"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// After a job is queued, keep calling router.refresh() so the server component
// re-renders with fresh receipts — the agent picks the request up within ~2 min
// and the result lands a few seconds after that. Stops once `pending` has gone
// false and we've done a couple of catch-up refreshes, or at the cap.
//
// Returns `watching` so the caller can show a "running…" state.
export function useRefreshUntil(
  pending: boolean,
  { intervalMs = 8000, capMs = 5 * 60_000 }: { intervalMs?: number; capMs?: number } = {},
): { watching: boolean; start: () => void } {
  const router = useRouter();
  const [watching, setWatching] = useState(false);
  const startedAt = useRef(0);
  const sawCleared = useRef(false);

  const start = () => {
    startedAt.current = Date.now();
    sawCleared.current = false;
    setWatching(true);
  };

  useEffect(() => {
    if (!watching) return;

    const tick = () => {
      const elapsed = Date.now() - startedAt.current;
      if (elapsed > capMs) {
        setWatching(false);
        return;
      }
      // `pending` false means the agent consumed the request file. Give the
      // result a moment to be written, then do one last refresh and stop.
      if (!pending) {
        if (sawCleared.current) {
          router.refresh();
          setWatching(false);
          return;
        }
        sawCleared.current = true;
      }
      router.refresh();
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [watching, pending, intervalMs, capMs, router]);

  return { watching, start };
}
