"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createIdea } from "@/lib/actions/planning";

export function NewPlanningItemForm({ parent }: { parent?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createIdea(trimmed, parent);
      setTitle("");
      // Stay put and re-render the list in place — the same pattern every other
      // editor here uses. Click into the new item if you want to flesh it out.
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={parent ? "New sub-idea title..." : "New idea title..."}
        className="font-mono text-sm h-8"
      />
      <Button size="sm" disabled={isPending || !title.trim()} onClick={submit}>
        {isPending ? "Adding..." : "Add"}
      </Button>
    </div>
  );
}
