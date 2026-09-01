import { MarkdownRenderer } from "@/components/markdown-renderer";
import Link from "next/link";

export function HandoffLog({ content, slug }: { content: string; slug: string }) {
  const firstEntry = content.search(/^## /m);
  if (firstEntry < 0) return <MarkdownRenderer content={content} />;
  const remainderStart = content.slice(firstEntry + 3).search(/^## /m);
  const splitAt = remainderStart < 0 ? content.length : firstEntry + 3 + remainderStart;
  const latest = content.slice(firstEntry, splitAt).trim();
  const hasHistory = Boolean(content.slice(splitAt).trim());

  return (
    <div className="space-y-4">
      <MarkdownRenderer content={latest} />
      {hasHistory && (
        <Link href={`/projects/${slug}/handoff`} prefetch={false} className="inline-block border-t border-border/60 pt-3 text-xs text-sky-400 hover:underline">
          View older handoff history
        </Link>
      )}
    </div>
  );
}
