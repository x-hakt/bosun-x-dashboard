"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  postPortalIdeaReply,
  postPortalTaskReply,
  postPortalMessage,
  acknowledgePortalIdea,
  acknowledgePortalTask,
} from "@/lib/portal/reply";

// Where a reply / sign-off lands: a planning idea thread, one project task's
// thread, or the client's general message thread (CGB-10, no sign-off there —
// "approve" doesn't mean anything for a freeform chat). The portal page picks
// the target; this component just posts to it.
export type ReplyTarget =
  | { kind: "idea"; ideaId: string }
  | { kind: "task"; project: string; taskId: string }
  | { kind: "message" };

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
    run(() => {
      if (target.kind === "idea") return postPortalIdeaReply(target.ideaId, text);
      if (target.kind === "task") return postPortalTaskReply(target.project, target.taskId, text);
      return postPortalMessage(text);
    }, true);

  const signOff = () =>
    run(() => {
      if (target.kind === "idea") return acknowledgePortalIdea(target.ideaId);
      if (target.kind === "task") return acknowledgePortalTask(target.project, target.taskId);
      return Promise.resolve();
    });

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
        placeholder={target.kind === "message" ? "Send a message…" : "Add a reply…"}
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
          {pending ? "Posting…" : target.kind === "message" ? "Send" : "Post reply"}
        </button>
        {target.kind !== "message" && (
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
        )}
      </div>
    </form>
  );
}
