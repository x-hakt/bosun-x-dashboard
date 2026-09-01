import { TriangleAlert } from "lucide-react";

// Deliberately NOT a tag — this is an operational flag ("something here is ambiguous,
// a human should look at it and its `notes` field"), not a tech-stack descriptor, so it
// gets its own distinct visual treatment instead of living in the tags row.
export function NeedsReviewIndicator({ className }: { className?: string }) {
  return (
    <TriangleAlert
      className={`size-3.5 text-amber-400 shrink-0 ${className ?? ""}`}
      aria-label="Needs review"
    >
      <title>Needs review — see notes</title>
    </TriangleAlert>
  );
}
