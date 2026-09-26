import Link from "next/link";
import { AlertTriangle, Bell, CircleAlert, ExternalLink } from "lucide-react";
import { openNotifications, type NotificationLevel } from "@/lib/data/notifications";
import { NotificationActions } from "@/components/notification-actions";
import { cn } from "@/lib/utils";

// BXD-99 — the Overview's "Needs you" list: things a source (a planner run, a cron
// job, an agent) has raised via `npm run notify`. Backup and job problems stay in
// the fleet-wide banner above every page, so they aren't repeated here. Renders
// nothing when the inbox is empty.

const LEVEL: Record<NotificationLevel, { icon: typeof Bell; tone: string }> = {
  urgent: { icon: CircleAlert, tone: "text-destructive" },
  warn: { icon: AlertTriangle, tone: "text-amber-400" },
  info: { icon: Bell, tone: "text-sky-400" },
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export async function NeedsYou() {
  const items = await openNotifications();
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5">
      <h2 className="flex items-center gap-2 border-b border-amber-500/20 px-3 py-2 text-sm font-medium">
        <Bell className="size-4 text-amber-400" />
        Needs you
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">{items.length}</span>
      </h2>
      <ul className="divide-y divide-border/50">
        {items.map((n) => {
          const { icon: Icon, tone } = LEVEL[n.level] ?? LEVEL.info;
          const external = n.href ? /^https?:\/\//.test(n.href) : false;
          const title = <span className="font-medium">{n.title}</span>;
          return (
            <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <div className="min-w-0 flex-1 basis-60">
                {n.href ? (
                  external ? (
                    <a href={n.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline underline-offset-2">
                      {title}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                  ) : (
                    <Link href={n.href} className="hover:underline underline-offset-2">
                      {title}
                    </Link>
                  )
                ) : (
                  title
                )}
                {n.body && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {n.source} · {ago(n.updated)}
                  {n.count > 1 ? ` · raised ${n.count}×` : ""}
                </p>
              </div>
              <NotificationActions id={n.id} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
