import { redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/portal/auth";
import { getPortalMessages } from "@/lib/portal/projection";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PortalReplyForm } from "@/components/portal/portal-reply-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalMessagesPage() {
  const viewer = await getPortalViewer();
  if (!viewer) redirect("/login");

  if (viewer.kind !== "client") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl">Messages</h1>
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          This is a direct line between you and one invited client — sign in as a client to see or send anything
          here.
        </p>
      </div>
    );
  }

  const { thread } = await getPortalMessages(viewer);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl">Messages</h1>

      {thread ? (
        <div className="pt-prose">
          <MarkdownRenderer content={thread} />
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--portal-ink-soft)" }}>
          No messages yet — say hello.
        </p>
      )}

      <div className="pt-card">
        <PortalReplyForm target={{ kind: "message" }} />
      </div>
    </div>
  );
}
