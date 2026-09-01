import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownRenderer({
  content,
  variant = "compact",
}: {
  content: string;
  /** "compact" for dense dashboard cards (default); "article" for long-form reading content. */
  variant?: "compact" | "article";
}) {
  return (
    <div
      className={cn(
        "prose prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline",
        "prose-table:text-sm prose-th:text-muted-foreground",
        "prose-code:before:content-none prose-code:after:content-none",
        variant === "article"
          ? "prose-base max-w-3xl mx-auto prose-p:leading-relaxed"
          : "prose-sm max-w-none"
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
