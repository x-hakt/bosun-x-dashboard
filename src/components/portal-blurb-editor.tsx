"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { savePortalBlurb } from "@/lib/actions/projects";

// CGB-17: the client-facing summary (PORTAL.md) rendered at the top of the
// portal project page — separate from the internal Overview (STATUS.md).
// Previously a hand-edited file with no UI at all.
export function PortalBlurbEditor({ slug, initialContent }: { slug: string; initialContent: string }) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1.5">
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        rows={5}
        className="text-xs"
        placeholder="A short, plain-language summary for the client — shown above the shared work on their portal page. Markdown supported."
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={isPending || saved}
          onClick={() =>
            startTransition(async () => {
              await savePortalBlurb(slug, content);
              setSaved(true);
              router.refresh();
            })
          }
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-[11px] text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
