"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotesThread } from "@/components/notes-thread";
import { countClientReplies } from "@/lib/notes-thread";
import { saveOperatorMessageThread, markMessagesReviewed } from "@/lib/actions/portal-messages";
import { cn } from "@/lib/utils";

interface ClientThreadView {
  slug: string;
  name: string;
  portal: string;
  notes: string;
  operatorSeen: number;
}

function excerpt(value: string): string | undefined {
  const clean = value
    .replace(/^\s*---.*?---\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

function lastLine(value: string): string | undefined {
  const lines = value.trim().split("\n");
  return excerpt(lines.at(-1) ?? "");
}

function ClientThreadRow({ client }: { client: ClientThreadView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const unseen = Math.max(0, countClientReplies(client.notes) - client.operatorSeen);

  return (
    <div className="group border-b border-border/50 last:border-b-0">
      <div className="flex min-h-11 items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={expanded ? `Collapse ${client.name}` : `Expand ${client.name}`}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">{client.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground/60">{client.portal}</span>
          </span>
          {!expanded && lastLine(client.notes) && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{lastLine(client.notes)}</span>
          )}
        </button>

        {unseen > 0 && (
          <span
            className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
            title="Unreviewed client messages"
          >
            {unseen} new
          </span>
        )}
      </div>

      {expanded && (
        <div className="mb-3 ml-7 space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
          {unseen > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2">
              <span className="text-xs text-amber-300">
                {unseen} new message{unseen === 1 ? "" : "s"} from {client.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  await markMessagesReviewed(client.slug);
                  router.refresh();
                })}
              >
                Mark reviewed
              </Button>
            </div>
          )}
          <NotesThread
            value={client.notes}
            onSave={(next) => saveOperatorMessageThread(client.slug, next)}
            authorName="You"
            editorRows={8}
            placeholder="Nothing yet — send the first message."
          />
        </div>
      )}
    </div>
  );
}

export function PortalMessagesList({ clients }: { clients: ClientThreadView[] }) {
  const totalUnseen = clients.reduce((n, c) => n + Math.max(0, countClientReplies(c.notes) - c.operatorSeen), 0);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Send className="size-3.5" />
        {clients.length} client{clients.length === 1 ? "" : "s"}
        {totalUnseen > 0 && (
          <span className={cn("font-medium text-amber-400")}>
            · {totalUnseen} unreviewed message{totalUnseen === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <div className="overflow-hidden rounded-md border border-border/60 bg-card px-3">
        {clients.map((client) => (
          <ClientThreadRow key={client.slug} client={client} />
        ))}
      </div>
    </div>
  );
}
