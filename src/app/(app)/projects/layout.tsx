import { DetailPanel } from "@/components/detail-panel";

export const dynamic = "force-dynamic";

// The project list now lives in the main sidebar nav (Projects → status → project), so
// this route no longer carries its own list column — children get the full content pane.
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100vh-5.75rem)] overflow-y-auto themed-scrollbar">
      <DetailPanel>{children}</DetailPanel>
    </div>
  );
}
