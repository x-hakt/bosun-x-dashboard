import { cn } from "@/lib/utils";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";

export function StatTile({
  label,
  value,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
  compact?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    good: STATUS_TEXT_CLASS.up,
    warn: STATUS_TEXT_CLASS.attention,
    bad: STATUS_TEXT_CLASS.down,
  }[tone];

  return (
    <div className="border border-border/60 rounded-lg px-4 py-3 bg-card/50">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={cn("font-mono font-semibold mt-1", compact ? "text-sm leading-relaxed" : "text-2xl", toneClass)}>
        {value}
      </div>
    </div>
  );
}
