import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <div className="space-y-4" aria-label="Loading project">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-64 lg:col-span-2 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
