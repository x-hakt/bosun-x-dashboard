"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  postPortalIdeaReply,
  postPortalTaskReply,
  acknowledgePortalIdea,
  acknowledgePortalTask,
} from "@/lib/portal/reply";

// Where a reply / sign-off lands: a planning idea thread, or one project task's
// thread. The portal page picks the target; this component just posts to it.
export type ReplyTarget =
  | { kind: "idea"; ideaId: string }
  | { kind: "task"; project: string; taskId: string };

export function PortalReplyForm({ target }: { target: ReplyTarget }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>, clear = false) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
        if (clear) setText("");
        router.refresh();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Could not post.");
      }
    });

  const postReply = () =>
    run(
      () =>
        target.kind === "idea"
          ? postPortalIdeaReply(target.ideaId, text)
          : postPortalTaskReply(target.project, target.taskId, text),
      true,
    );

  const signOff = () =>
    run(() =>
      target.kind === "idea"
        ? acknowledgePortalIdea(target.ideaId)
        : acknowledgePortalTask(target.project, target.taskId),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        postReply();
      }}
      className="space-y-2"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={target.kind === "task" ? 3 : 4}
        placeholder="Add a reply…"
        className="pt-textarea"
      />
      {err && (
        <p className="text-xs" style={{ color: "#f87171" }}>
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="pt-cta"
          style={pending || !text.trim() ? { opacity: 0.5 } : undefined}
        >
          {pending ? "Posting…" : "Post reply"}
        </button>
        <button
          type="button"
          onClick={signOff}
          disabled={pending}
          className="pt-ghost-btn"
          style={pending ? { opacity: 0.5 } : undefined}
          title="Post a sign-off on this — the operator sees it flagged"
        >
          Approve / sign off
        </button>
      </div>
    </form>
  );
}
