"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// A per-browser map of boolean flags ({ [id]: true|false }) in localStorage, shared by
// every component that uses the same key and kept in sync across tabs. Falls back to
// memory when storage is unavailable. The server snapshot is always empty, so the first
// paint matches the server render and stored choices apply right after hydration.
// Used by the sidebar's open sections (BXD-59) and collapsed planning trees (BXD-60).

type Flags = Record<string, boolean>;

const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string>();

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? "{}";
  } catch {
    return memory.get(key) ?? "{}";
  }
}

function parse(raw: string): Flags {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readStoredFlags(key: string): Flags {
  return parse(read(key));
}

export function writeStoredFlags(key: string, flags: Flags): void {
  const raw = JSON.stringify(flags);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {}
  listeners.get(key)?.forEach((listener) => listener());
}

export function useStoredFlags(key: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      const onStorage = (e: StorageEvent) => e.key === key && listener();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.get(key)?.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "{}");
  const flags = useMemo(() => parse(raw), [raw]);
  // Always merges onto the latest stored value, never a possibly-stale render snapshot.
  const set = useCallback((id: string, value: boolean) => writeStoredFlags(key, { ...readStoredFlags(key), [id]: value }), [key]);
  return { flags, set };
}
