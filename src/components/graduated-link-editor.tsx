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
      {projectSlug && (
        <Link href={`/projects/${projectSlug}`} className="text-xs text-sky-400 hover:underline shrink-0">
          View project →
        </Link>
      )}
    </div>
  );
}
