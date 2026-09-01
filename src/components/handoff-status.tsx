import type { HandoffState } from "@/lib/types";

export function HandoffStatus({ state }: { state?: HandoffState }) {
  if (!state?.checkpoint_at) return null;
  const ageMinutes = state.age_minutes ?? 0;
  const stale = state.stale ?? false;
  const tone = !state.active
    ? "border-slate-700 bg-slate-900/50 text-slate-400"
    : stale
      ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
      : "border-emerald-700/60 bg-emerald-950/40 text-emerald-300";
  const label = !state.active ? "Handoff complete" : stale ? "Handoff stale" : "Work active";

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`} title={state.summary}>
      <span className="font-medium">{label}</span>
      <span className="text-current/70"> · {state.agent ?? "unknown agent"} · {ageMinutes}m ago</span>
      {state.summary && <p className="mt-1 line-clamp-2 text-current/80">{state.summary}</p>}
    </div>
  );
}
