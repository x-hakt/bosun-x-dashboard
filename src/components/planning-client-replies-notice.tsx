"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markClientRepliesReviewed } from "@/lib/actions/planning";

// CGB-6: shown on a shared idea thread when a portal client has replied since the
// operator last marked it reviewed. "Mark reviewed" pins the seen count.
export function PlanningClientRepliesNotice({ id, unseen }: { id: string; unseen: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-amber-300">
        <MessageSquare className="size-4 shrink-0" />
        {unseen} new client repl{unseen === 1 ? "y" : "ies"} on this thread
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await markClientRepliesReviewed(id);
            router.refresh();
          })
        }
      >
        <Check className="size-3.5" /> {isPending ? "Saving…" : "Mark reviewed"}
      </Button>
    </div>
  );
}
