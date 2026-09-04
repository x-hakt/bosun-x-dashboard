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
