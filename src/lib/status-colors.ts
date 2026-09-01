// Single source of truth for the app's status color semantics, so every place a status
// indicator appears (project cards, detail pages, host cards, the topology diagram,
// container tables) uses the exact same four colors for the exact same meaning:
//   up        — green  — running / passing / live
//   down      — red    — stopped / failing
//   attention — yellow — running but degraded (e.g. failing a required standard,
//                        or a container reporting healthcheck-unhealthy while still up)
//   unknown   — grey   — not live-monitored / nothing to report
export type StatusLevel = "up" | "down" | "attention" | "unknown";

export const STATUS_BADGE_CLASS: Record<StatusLevel, string> = {
  up: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  down: "bg-destructive/15 text-destructive border-destructive/30",
  attention: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  unknown: "bg-muted text-muted-foreground border-transparent",
};

export const STATUS_DOT_CLASS: Record<StatusLevel, string> = {
  up: "bg-emerald-400",
  down: "bg-destructive",
  attention: "bg-amber-400",
  unknown: "bg-muted-foreground/50",
};

export const STATUS_TEXT_CLASS: Record<StatusLevel, string> = {
  up: "text-emerald-400",
  down: "text-destructive",
  attention: "text-amber-400",
  unknown: "text-muted-foreground",
};

export const STATUS_FILL_CLASS: Record<StatusLevel, string> = {
  up: "fill-emerald-400",
  down: "fill-destructive",
  attention: "fill-amber-400",
  unknown: "fill-muted-foreground/60",
};

// Product-status accents (Live/Development/Paused/Abandoned) — a separate axis from the
// up/down/attention model above. Matches ProjectStatusBadge's palette so the nav, badges
// and any status-grouped list read as the same colour language.
export const PROJECT_STATUS_ACCENT: Record<string, { text: string; border: string }> = {
  Live: { text: "text-emerald-400", border: "border-emerald-500/40" },
  Development: { text: "text-sky-400", border: "border-sky-500/40" },
  Paused: { text: "text-amber-400", border: "border-amber-500/40" },
  Abandoned: { text: "text-zinc-500", border: "border-zinc-700/50" },
};

export const PROJECT_STATUS_ACCENT_FALLBACK = { text: "text-muted-foreground", border: "border-border/60" };

export function projectStatusAccent(status?: string) {
  return (status && PROJECT_STATUS_ACCENT[status]) || PROJECT_STATUS_ACCENT_FALLBACK;
}
