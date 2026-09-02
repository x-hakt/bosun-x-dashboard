"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setGraduatedProject } from "@/lib/actions/planning";

export function GraduatedLinkEditor({ id, projectSlug }: { id: string; projectSlug?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(projectSlug ?? "");
  const [isPending, startTransition] = useTransition();

  // The field is meant to hold a project slug, but people paste product URLs.
  // Render whatever's there as a link that actually works rather than a broken
  // /projects/https://… path.
  const isUrl = projectSlug ? /^https?:\/\//i.test(projectSlug) : false;
  const looksLikeSlug = projectSlug ? /^[a-z0-9][a-z0-9-]*$/i.test(projectSlug) : false;

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="project slug once graduated..."
        className="font-mono text-xs h-7"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await setGraduatedProject(id, value.trim());
            router.refresh();
          })
        }
      >
        {isPending ? "Saving..." : "Link"}
      </Button>
      {projectSlug && isUrl && (
        <a
          href={projectSlug}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 hover:underline shrink-0"
        >
          Open link ↗
        </a>
      )}
      {projectSlug && !isUrl && looksLikeSlug && (
        <Link href={`/projects/${projectSlug}`} className="text-xs text-sky-400 hover:underline shrink-0">
          View project →
        </Link>
      )}
      {projectSlug && !isUrl && !looksLikeSlug && (
        <span className="text-xs text-amber-400 shrink-0" title="Not a valid project slug or URL">
          ⚠ invalid
        </span>
      )}
    </div>
  );
}
