"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { renameProject } from "@/lib/actions/projects";

export function ProjectTitle({ slug, initialName }: { slug: string; initialName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const nextSlug = await renameProject(slug, trimmed);
      setEditing(false);
      if (nextSlug !== slug) router.replace(`/projects/${nextSlug}`);
      else router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="font-mono text-lg font-semibold h-9 w-72"
          disabled={isPending}
        />
        <button onClick={save} className="text-emerald-400 hover:text-emerald-300" disabled={isPending}>
          <Check className="size-4" />
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className="text-lg font-semibold tracking-tight">{initialName}</h1>
      <button
        onClick={() => {
          setValue(initialName);
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
