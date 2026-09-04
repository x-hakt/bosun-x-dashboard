"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
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
        className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-[var(--portal-ink)] placeholder:text-[var(--portal-ink)]/40"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--portal-accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Post reply
      </button>
    </form>
  );
}
