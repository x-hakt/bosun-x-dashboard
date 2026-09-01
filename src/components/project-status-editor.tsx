"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectStatus } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";

const KNOWN = ["Live", "Development", "Paused", "Abandoned"];

export function ProjectStatusEditor({ slug, status }: { slug: string; status?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const options = status && !KNOWN.includes(status) ? [status, ...KNOWN] : KNOWN;

  return (
    <select
      value={status ?? ""}
      disabled={isPending}
      onChange={(e) =>
        startTransition(async () => {
          await updateProjectStatus(slug, e.target.value);
          router.refresh();
        })
      }
      className={cn(
        "text-xs font-mono rounded-md border border-border/60 bg-card px-2 py-1",
        "text-muted-foreground hover:text-foreground transition-colors",
      )}
    >
      <option value="">(unset)</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
