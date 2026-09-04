"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postPortalIdeaReply } from "@/lib/portal/reply";

export function PortalReplyForm({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null);
          try {
            await postPortalIdeaReply(ideaId, text);
            setText("");
            router.refresh();
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not post.");
          }
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Add a reply…"
        className="pt-textarea"
      />
      {err && <p className="text-xs" style={{ color: "#f87171" }}>{err}</p>}
      <button type="submit" disabled={pending || !text.trim()} className="pt-cta" style={pending || !text.trim() ? { opacity: 0.5 } : undefined}>
        {pending ? "Posting…" : "Post reply"}
      </button>
    </form>
  );
}
