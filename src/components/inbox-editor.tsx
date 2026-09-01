"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { saveInboxNote } from "@/lib/actions/notes";

export function InboxEditor({ initialContent }: { initialContent: string }) {
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
        rows={12}
        className="font-mono text-sm"
        placeholder="Freeform ideas and todos..."
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={isPending || saved}
          onClick={() =>
            startTransition(async () => {
              await saveInboxNote(content);
              setSaved(true);
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
