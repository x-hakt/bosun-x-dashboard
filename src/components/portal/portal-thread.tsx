import { parseNoteThread } from "@/lib/notes-thread";
import { MarkdownRenderer } from "@/components/markdown-renderer";

// CGB-19: the client-facing read view of a conversation thread (a task
// description, a planning NOTES.md, or the direct message thread). The operator
// side has its own richer editor; here we just split the single markdown field
// into turns and lay them out as a conversation. `--- Author · date · label ---`
// header lines become card chrome instead of showing as raw text.
//
// parseNoteThread lives outside src/lib/portal/** and is a pure string parser
// (no data loaders), so the isolation fence doesn't apply.

export function PortalThread({ content }: { content: string }) {
  const turns = parseNoteThread(content);
  if (turns.length === 0) return null;

  // Everything before the first header is the standing brief / opening post —
  // render it as plain prose, no chrome.
  const [first, ...rest] = turns;
  const openingIsBrief = !first.author && !first.date && !first.label;

  return (
    <div className="space-y-3">
      {openingIsBrief ? (
        <div className="pt-prose">
          <MarkdownRenderer content={first.body} />
        </div>
      ) : (
        <ThreadTurn turn={first} />
      )}
      {rest.map((turn, i) => (
        <ThreadTurn key={i} turn={turn} />
      ))}
    </div>
  );
}

function ThreadTurn({ turn }: { turn: ReturnType<typeof parseNoteThread>[number] }) {
  const isClient = turn.role === "client";
  const who = isClient ? "You" : turn.author || "Update";
  const bits = [who, turn.date, turn.label && !/^client /i.test(turn.label) ? turn.label : null].filter(Boolean);

  return (
    <div
      className="rounded-[6px] border-l-2 pl-3 pr-1 py-1"
      style={{
        borderColor: isClient ? "var(--portal-accent)" : "var(--portal-line-strong)",
        background: isClient ? "rgba(45, 212, 191, 0.05)" : "transparent",
      }}
    >
      <p
        className="mb-1 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: isClient ? "var(--portal-accent)" : "var(--portal-ink-faint)" }}
      >
        {bits.join(" · ")}
      </p>
      <div className="pt-prose" style={{ fontSize: "0.9rem" }}>
        <MarkdownRenderer content={turn.body} />
      </div>
    </div>
  );
}
