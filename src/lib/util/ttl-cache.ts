// Small in-memory TTL memoization for expensive computed facts (git/docker/filesystem
// shell-outs) that don't need to be exact-to-the-request-fresh. A short window (seconds
// to ~a minute) keeps pages fast under repeated navigation without the data feeling
// stale — these are dashboards a human is actively looking at, not financial ledgers.
interface CacheEntry {
  value?: unknown;
  error?: unknown;
  isError?: boolean;
  expires: number;
  pending?: Promise<unknown>;
}

interface CacheOptions {
  // When fn() rejects, remember the failure for this long instead of the full ttlMs.
  // Keeps a genuinely-down dependency from being retried on every single request while
  // still recovering quickly once it comes back. Without this, a rejection is not
  // cached at all (next request retries immediately).
  negativeTtlMs?: number;
}

// Next/Turbopack can include this module in more than one server route chunk. A
// module-local Map then creates one cache per chunk, so Overview, /projects and
// /projects/[slug] each repay the same remote SSH cost. Anchor the store on the Node
// process instead: still ephemeral and instance-local, but genuinely shared by routes.
const cacheGlobal = globalThis as typeof globalThis & {
  __controlRoomTtlCache?: Map<string, CacheEntry>;
};
const store = cacheGlobal.__controlRoomTtlCache ??= new Map<string, CacheEntry>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, options?: CacheOptions): Promise<T> {
  const hit = store.get(key);
  // A cache miss used to let every concurrent caller launch the same shell/SSH work.
  // Share the in-flight promise as well as the completed value: project detail,
  // standards, sidebar and overview commonly request the same fact in parallel.
  if (hit?.pending) return hit.pending as Promise<T>;
  if (hit && hit.expires > Date.now()) {
    if (hit.isError) throw hit.error;
    return hit.value as T;
  }

  const entry: CacheEntry = { expires: 0 };
  const pending = fn().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    (error) => {
      const negativeTtlMs = options?.negativeTtlMs ?? 0;
      if (negativeTtlMs > 0) {
        store.set(key, { error, isError: true, expires: Date.now() + negativeTtlMs });
      } else if (store.get(key) === entry) {
        store.delete(key);
      }
      throw error;
    },
  );
  entry.pending = pending;
  store.set(key, entry);
  return pending;
}
