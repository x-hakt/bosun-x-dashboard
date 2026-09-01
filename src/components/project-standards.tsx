import { Check, X, Minus } from "lucide-react";
import type { CheckSeverity, CheckStatus } from "@/lib/types";
import { STATUS_TEXT_CLASS } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

export type ProjectStandardRow = {
  label: string;
  severity: CheckSeverity;
  status: CheckStatus;
  detail?: string;
};

const ICON: Record<CheckStatus, { Icon: typeof Check; className: string }> = {
  pass: { Icon: Check, className: STATUS_TEXT_CLASS.up },
  fail: { Icon: X, className: STATUS_TEXT_CLASS.down },
  na: { Icon: Minus, className: STATUS_TEXT_CLASS.unknown },
};

// One compact row per registry check — no table, so it never needs a horizontal
// scrollbar in the narrow detail-page rail. The full cross-project audit and the
// registry definitions live on /standards; this is just "where does THIS project stand".
export function ProjectStandards({ rows }: { rows: ProjectStandardRow[] }) {
  return (
    <ul className="divide-y divide-border/50 text-sm">
      {rows.map((row) => {
        const { Icon, className } = ICON[row.status];
        return (
          <li key={row.label} className="flex items-start gap-2.5 py-1.5">
            <Icon className={cn("size-4 shrink-0 mt-0.5", className)} />
            <span className="min-w-0 flex-1">
              {row.label}
              {row.detail && <span className="block text-xs text-muted-foreground">{row.detail}</span>}
            </span>
            {row.severity === "required" && (
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60">req</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
