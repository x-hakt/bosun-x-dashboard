"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProjectLinks, type ProjectLinkInput } from "@/lib/actions/project-links";

// CGB-13: links were previously read-only (hand-edit project.yml only). Now
// editable, with a per-link "portal" checkbox — only checked links reach the
// client portal (an admin panel or a monitoring URL stays operator-only by
// default). Rows with an empty label or url are dropped on save.
export function ProjectLinksEditor({
  slug,
  initialLinks,
  errorTrackingUrl,
}: {
  slug: string;
  initialLinks: ProjectLinkInput[];
  errorTrackingUrl?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectLinkInput[]>(initialLinks);
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (index: number, patch: Partial<ProjectLinkInput>) => {
    setSaved(false);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const remove = (index: number) => {
    setSaved(false);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };
  const add = () => {
    setSaved(false);
    setRows((prev) => [...prev, { label: "", url: "", portal: false }]);
  };

  const save = () =>
    startTransition(async () => {
      await saveProjectLinks(slug, rows);
      setSaved(true);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No links yet.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Label"
            className="w-28 shrink-0 text-xs"
          />
          <Input
            value={row.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://…"
            className="min-w-0 flex-1 text-xs"
          />
          <label
            className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
            title="Show this link in the client portal"
          >
            <input type="checkbox" checked={row.portal} onChange={(e) => update(i, { portal: e.target.checked })} />
            portal
          </label>
          <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => remove(i)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={add}>
          <Plus className="size-3.5" /> Add link
        </Button>
        <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={saving} onClick={save}>
          {saved && <Check className="size-3.5" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save links"}
        </Button>
      </div>

      {errorTrackingUrl && (
        <a
          href={errorTrackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block pt-1 text-sm text-sky-400 hover:underline"
        >
          Error tracker ↗
        </a>
      )}
    </div>
  );
}
