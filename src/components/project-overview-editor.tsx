"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { saveProjectOverview } from "@/lib/actions/projects";

export function ProjectOverviewEditor({ slug, initialContent }: { slug: string; initialContent: string }) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        rows={10}
        className="font-mono text-sm"
        placeholder="Describe this project in prose..."
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={isPending || saved}
          onClick={() =>
            startTransition(async () => {
              await saveProjectOverview(slug, content);
              setSaved(true);
              router.refresh();
            })
          }
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
