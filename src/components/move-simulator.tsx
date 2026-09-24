"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, fmtBytes, fmtCores } from "@/components/capacity-bar";
import { COMFORT_RATIO, simulateMove, type FitVerdict, type HostCapacity } from "@/lib/infra/capacity-core";
import type { ProjectFacts } from "@/lib/infra/capacity";
import { cn } from "@/lib/utils";

// BXD-64: "would project X fit on host Y?" Everything is computed in the browser
// from the capacity figures already on the page; nothing on any server changes.

const VERDICT_TONE: Record<FitVerdict, string> = {
  ok: "text-emerald-400",
  tight: "text-amber-400",
  over: "text-destructive",
};

const selectClass =
  "w-full min-w-0 rounded-md border border-border/60 bg-card px-2 py-1 text-xs font-mono text-foreground disabled:opacity-50";

export function MoveSimulator({ hosts, projects }: { hosts: HostCapacity[]; projects: ProjectFacts[] }) {
  // Only projects actually running somewhere (a stopped one would "move" nothing).
  const running = (p: ProjectFacts, h: HostCapacity) =>
    p.hosts.includes(h.hostId) && Boolean(h.mem?.segments.some((s) => s.key === `project:${p.slug}`));
  const movable = projects.filter((p) => hosts.some((h) => running(p, h)));
  const [slug, setSlug] = useState("");
  const project = movable.find((p) => p.slug === slug);
  const sources = project ? hosts.filter((h) => running(project, h)) : [];
  const [sourcePick, setSourcePick] = useState("");
  const sourceId = sources.some((h) => h.hostId === sourcePick) ? sourcePick : sources[0]?.hostId ?? "";
  const targets = hosts.filter((h) => h.hostId !== sourceId);
  const [targetPick, setTargetPick] = useState("");
  const targetId = targets.some((h) => h.hostId === targetPick) ? targetPick : targets[0]?.hostId ?? "";

  const source = hosts.find((h) => h.hostId === sourceId);
  const target = hosts.find((h) => h.hostId === targetId);
  const sim = project && source && target ? simulateMove(source, target, project.slug) : null;

  if (movable.length === 0 || hosts.length < 2) return null;

  const snapshotBasis = Boolean(source && target && (source.mem?.basis !== "p95" || target.mem?.basis !== "p95"));
  const mem = sim?.target.mem;
  const cpu = sim?.target.cpu;

  const warnings: string[] = [];
  if (sim && project && source && target) {
    if (sim.archMismatch) warnings.push(`CPU architecture differs (${source.arch} → ${target.arch}): images may need rebuilding for ${target.arch}.`);
    if (project.databases.length) warnings.push(`Database container${project.databases.length === 1 ? "" : "s"} (${project.databases.join(", ")}): data needs a dump/restore or volume copy, plus downtime.`);
    if (project.namedVolumes) warnings.push(`${project.namedVolumes} named volume${project.namedVolumes === 1 ? "" : "s"} to copy across.`);
    if (project.bindMounts) warnings.push(`${project.bindMounts} bind mount${project.bindMounts === 1 ? "" : "s"}: host folders (config, data, uploads) to copy, and paths may differ.`);
    if (project.traefik) warnings.push("Has Traefik routing labels: DNS and the reverse proxy need moving too.");
    if (cpu && cpu.verdict !== "ok") warnings.push(`CPU would be at ${Math.round(cpu.ratio * 100)}% (an estimate from load average).`);
    if (snapshotBasis) warnings.push("Based on a single live snapshot; this switches to p95 once a day of history is recorded.");
    warnings.push("Disk footprint isn't measured per project yet (BXD-65/66): check free disk on the target by hand.");
  }

  let headline = "";
  if (sim && mem && target && project) {
    const pctAfter = Math.round(mem.ratio * 100);
    headline =
      sim.verdict === "ok"
        ? `Fits comfortably: ${target.hostName} RAM would be at ${pctAfter}%.`
        : sim.verdict === "tight"
          ? `Tight: ${target.hostName} RAM would be at ${pctAfter}%, above the ${Math.round(COMFORT_RATIO * 100)}% line.`
          : `Doesn't fit: ${target.hostName} would be ${fmtBytes(mem.overBy)} over its RAM.`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Move simulator</CardTitle>
        <p className="text-xs text-muted-foreground">Would a project fit on another server? Nothing is changed anywhere.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="space-y-1 text-[11px] font-mono text-muted-foreground">
            <span>Project</span>
            <select className={selectClass} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Project to move">
              <option value="">Choose a project…</option>
              {movable.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-mono text-muted-foreground">
            <span>From</span>
            <select className={selectClass} value={sourceId} onChange={(e) => setSourcePick(e.target.value)} disabled={sources.length < 2} aria-label="Move from">
              {sources.length === 0 && <option value="">—</option>}
              {sources.map((h) => (
                <option key={h.hostId} value={h.hostId}>
                  {h.hostName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-mono text-muted-foreground">
            <span>To</span>
            <select className={selectClass} value={targetId} onChange={(e) => setTargetPick(e.target.value)} disabled={!project} aria-label="Move to">
              {targets.map((h) => (
                <option key={h.hostId} value={h.hostId}>
                  {h.hostName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sim && project && source && target && (
          <div className="space-y-3" aria-live="polite">
            <p className={cn("text-sm font-medium", VERDICT_TONE[sim.verdict])} data-verdict={sim.verdict}>
              {headline}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground">
              {project.name} brings {fmtBytes(mem?.moving ?? 0)} RAM and {fmtCores(cpu?.moving ?? 0)}
              {mem?.bar.basis === "p95" || source.mem?.basis === "p95" ? " (p95)" : " (now)"}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-foreground">{target.hostName}, after (hatched = moving in)</p>
                {mem && <Bar bar={mem.bar} format={fmtBytes} height="h-4" label="RAM" />}
                {cpu && <Bar bar={cpu.bar} format={fmtCores} height="h-2" label="CPU" />}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-foreground">{source.hostName}, after</p>
                {sim.source.mem && <Bar bar={sim.source.mem.bar} format={fmtBytes} height="h-4" label="RAM" />}
                {sim.source.cpu && <Bar bar={sim.source.cpu.bar} format={fmtCores} height="h-2" label="CPU" />}
              </div>
            </div>
            {warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" aria-hidden />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
