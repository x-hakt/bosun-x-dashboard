import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Known values get a distinct style; anything else (a new value added purely in data,
// no code change) still renders — just with this neutral fallback.
const KNOWN_STYLE: Record<string, string> = {
  Live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Development: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Paused: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Abandoned: "bg-zinc-800/40 text-zinc-500 border-zinc-700/40",
};
const FALLBACK_STYLE = "bg-muted text-muted-foreground border-transparent";

export function ProjectStatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) return null;
  return (
    <Badge variant="outline" className={cn("font-normal", KNOWN_STYLE[status] ?? FALLBACK_STYLE, className)}>
      {status}
    </Badge>
  );
}
