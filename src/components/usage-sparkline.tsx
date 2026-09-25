import type { UsageSeries } from "@/lib/infra/capacity-core";
import { cn } from "@/lib/utils";

// BXD-71: a small server-rendered RAM (or CPU) sparkline. One unit of x per bucket; the
// SVG stretches to its box, so strokes are non-scaling. Null buckets (no samples: the
// sampler was down) break the line rather than dropping it to zero.

// Same hues as the capacity bars' project segments (capacity-bar.tsx PROJECT_BG).
const PROJECT_STROKE: Record<string, { line: string; area: string }> = {
  Live: { line: "stroke-emerald-500", area: "fill-emerald-500/10" },
  Development: { line: "stroke-sky-500", area: "fill-sky-500/10" },
  Paused: { line: "stroke-amber-500", area: "fill-amber-500/10" },
  Abandoned: { line: "stroke-zinc-500", area: "fill-zinc-500/10" },
};
const DEFAULT_STROKE = { line: "stroke-slate-400", area: "fill-slate-400/10" };

const H = 32;

// Runs of consecutive non-null buckets.
function runs(values: (number | null)[]): { start: number; points: number[] }[] {
  const out: { start: number; points: number[] }[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const last = out.at(-1);
    if (last && last.start + last.points.length === i) last.points.push(v);
    else out.push({ start: i, points: [v] });
  });
  return out;
}

export function UsageSparkline({
  series,
  status,
  label,
  className,
}: {
  series: UsageSeries;
  status?: string;
  label: string;
  className?: string;
}) {
  const n = series.values.length;
  const max = series.peak > 0 ? series.peak * 1.1 : 1;
  const y = (v: number) => H - (v / max) * (H - 2) - 1;
  const colour = (status && PROJECT_STROKE[status]) || DEFAULT_STROKE;

  const segments = runs(series.values).map(({ start, points }) => {
    // A lone bucket gets a short flat stroke so it's visible at all.
    const xs = points.length === 1 ? [start + 0.15, start + 0.85] : points.map((_, i) => start + i + 0.5);
    const ys = points.length === 1 ? [y(points[0]), y(points[0])] : points.map(y);
    const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)},${ys[i].toFixed(2)}`).join("");
    const area = `${line}L${xs.at(-1)!.toFixed(2)},${H}L${xs[0].toFixed(2)},${H}Z`;
    return { key: start, line, area };
  });

  return (
    <svg
      viewBox={`0 0 ${n} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("block h-8 w-full overflow-visible", className)}
    >
      <title>{label}</title>
      {segments.map((s) => (
        <path key={`a${s.key}`} d={s.area} className={cn(colour.area, "stroke-none")} />
      ))}
      {series.p95 > 0 && (
        <line
          x1={0}
          x2={n}
          y1={y(series.p95)}
          y2={y(series.p95)}
          className="stroke-muted-foreground/60"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
        />
      )}
      {series.peakIndex >= 0 && series.peak > 0 && (
        <line
          x1={series.peakIndex + 0.5}
          x2={series.peakIndex + 0.5}
          y1={0}
          y2={H}
          className="stroke-foreground/35"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
        />
      )}
      {segments.map((s) => (
        <path
          key={`l${s.key}`}
          d={s.line}
          className={cn(colour.line, "fill-none")}
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
