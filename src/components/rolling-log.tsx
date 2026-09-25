import Link from "next/link";
import type { PortFeed } from "@/lib/port-core";
import { clockText, entryText } from "@/lib/port-text";
import { cn } from "@/lib/utils";

// IDEA-20 (BXD-92): the rolling ship's log, squad-style. Short lines across every ship for
// the last 24 hours, oldest at the top, newest at the bottom, opened scrolled to the bottom
// (a column-reverse scroller needs no script to stay there). Same lines on both pages;
// the public version carries no links or detail.

const KIND_MARK: Record<string, string> = {
  aboard: "⚓", cabin: "⚓", work: "⚒", nod: "✓", captain: "!", ashore: "⛵", signoff: "·", cargo: "▣", delivery: "⚑", cart: "⛁",
};

export function RollingLog({ feed }: { feed: PortFeed }) {
  const ships = new Map(feed.ships.map((s) => [s.key, s]));
  const entries = feed.entries;
  return (
    <section className={cn("rounded-lg border p-4 space-y-2", feed.publicView ? "port-log-public" : "border-border bg-card")} aria-labelledby="rolling-log-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rolling-log-title" className="font-mono text-lg">Ship&apos;s log</h2>
        <span className="text-xs text-muted-foreground">Live · last 24 hours · {entries.length} entries</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">A quiet day in port: nothing logged in the last 24 hours.</p>
      ) : (
        <div className="port-rolling" tabIndex={0} aria-label="Ship's log entries, newest last">
          <ol>
            {entries.map((e) => {
              const ship = e.ship ? ships.get(e.ship) : undefined;
              return (
                <li key={e.id} className={cn("port-line", `port-line-${e.kind}`)}>
                  <time dateTime={e.at} className="port-line-time">{clockText(e.at)}</time>
                  <span className="port-line-mark" aria-hidden="true">{KIND_MARK[e.kind] ?? "·"}</span>
                  <span className="port-line-text">
                    {e.who && <b>{e.who} </b>}
                    {ship?.href ? <Link href={ship.href} className="hover:underline">{entryText(e, feed.ships)}</Link> : entryText(e, feed.ships)}
                    {e.detail && <span className="port-line-detail"> · {e.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
