// Short, speakable identifier for a task: "<PREFIX>-<num>", e.g. BXD-7.
// The prefix comes from the project's explicit `key` in project.yml when set, otherwise
// it is derived from the slug: initials of each hyphen segment for multi-word slugs
// (bosun-x-dashboard -> BXD, sportsball-coach -> SC), or the first three letters for a
// single-word slug (jellyfin -> JEL). Prefixes are not required to be globally unique —
// the number is per-project — but an explicit `key` lets you disambiguate if you want.

export function deriveTaskPrefix(slug: string): string {
  const segments = slug.split(/[-_]/).filter(Boolean);
  if (segments.length === 0) return "T";
  if (segments.length === 1) return segments[0].slice(0, 3).toUpperCase();
  return segments
    .map((segment) => segment[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function taskPrefix(project: { slug: string; key?: string }): string {
  const explicit = project.key?.trim();
  return explicit ? explicit.toUpperCase() : deriveTaskPrefix(project.slug);
}

export function taskKey(prefix: string, num?: number | null): string | undefined {
  return num ? `${prefix}-${num}` : undefined;
}

// BXD-46 — a sub-task (one with a `parent_id`) renders dotted, like planning
// ideas: the root task's number, then each level's 1-based position among its
// parent's children, ordered by creation (`num` as the tiebreak). So CGB-3, a
// child of CGB-2, shows as CGB-2.1.
//
// `num` stays stable and authoritative; this key is *derived*, so deleting an
// earlier sibling shifts the ones after it. The stable references are the task
// `id` and `<prefix>-<num>` — both still resolve. `allTasks` must be the whole
// project list so the parent chain can be walked.
type KeyTask = { id: string; num?: number | null; parent_id?: string | null; created?: string };

function siblingsOf(parentId: string, allTasks: KeyTask[]): KeyTask[] {
  return allTasks
    .filter((t) => t.parent_id === parentId)
    .sort((a, b) => {
      const ac = a.created ?? "";
      const bc = b.created ?? "";
      if (ac !== bc) return ac < bc ? -1 : 1;
      return (a.num ?? 0) - (b.num ?? 0);
    });
}

export function taskDisplayKey(task: KeyTask, allTasks: KeyTask[], prefix: string): string | undefined {
  if (task.num == null) return undefined;
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const chain: KeyTask[] = [];
  const seen = new Set<string>();
  let cur: KeyTask | undefined = task;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  const root = chain[0];
  if (root.num == null) return `${prefix}-${task.num}`; // orphaned parent chain — flag via `bosun doctor`
  let key = `${prefix}-${root.num}`;
  for (let depth = 1; depth < chain.length; depth += 1) {
    const parent = chain[depth - 1];
    const ordinal = siblingsOf(parent.id, allTasks).findIndex((t) => t.id === chain[depth].id) + 1;
    key += `.${ordinal || 1}`;
  }
  return key;
}
