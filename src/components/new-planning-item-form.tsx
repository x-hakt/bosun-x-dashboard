"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createIdea, createNote } from "@/lib/actions/planning";

export function NewPlanningItemForm({ kind, parent }: { kind: "idea" | "note"; parent?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      if (kind === "idea") await createIdea(trimmed, parent);
      else await createNote(trimmed);
      setTitle("");
      // Stay put and re-render the list in place — the same pattern every other
      // editor here uses. Click into the new item if you want to flesh it out.
      router.refresh();
    });
  }

  const placeholder =
    kind === "note" ? "New note title..." : parent ? "New sub-idea title..." : "New idea title...";

  return (
    <div className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="font-mono text-sm h-8"
      />
      <Button size="sm" disabled={isPending || !title.trim()} onClick={submit}>
        {isPending ? "Adding..." : "Add"}
      </Button>
    </div>
  );
}
