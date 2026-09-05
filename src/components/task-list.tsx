"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, CornerDownRight, Link2, Plus, Save, Share2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createTask,
  deleteTask,
  markTaskClientRepliesReviewed,
  setTaskDependencies,
  setTaskSharing,
  updateTask,
  updateTaskDescription,
  updateTaskStatus,
} from "@/lib/actions/tasks";
import type { Task, TaskStatus } from "@/lib/data/tasks-schema";
import { countClientReplies } from "@/lib/notes-thread";
import { NotesThread } from "@/components/notes-thread";
import { cn } from "@/lib/utils";

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const STATUS_CLASS: Record<TaskStatus, string> = {
  backlog: "border-border text-muted-foreground",
  todo: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

function excerpt(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 100 ? `${clean.slice(0, 97)}…` : clean;
}

function taskId(prefix: string, num?: number | null): string | undefined {
  return num ? `${prefix}-${num}` : undefined;
}

// Monospace chip carrying the speakable task id (e.g. CR-7). Clicking copies it, so
// "let's work on CR-7" is one action away; the row also anchors on `id` for deep links.
function TaskKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          },
          () => {},
        );
      }}
      title={`Copy ${value}`}
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-tight transition-colors",
        copied ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {copied ? "copied" : value}
    </button>
  );
}

function descendantIds(taskId: string, children: Map<string, Task[]>): Set<string> {
  const result = new Set<string>();
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (result.has(child.id)) continue;
      result.add(child.id);
      visit(child.id);
    }
  };
  visit(taskId);
  return result;
}

function TaskRow({
  slug,
  prefix,
  task,
  depth,
  allTasks,
  childrenByParent,
  portalClients,
  taskSharingDefault,
}: {
  slug: string;
  prefix: string;
  task: Task;
  depth: number;
  allTasks: Task[];
  childrenByParent: Map<string, Task[]>;
  /** Clients the PROJECT is already shared with — a task can only be shared with
   * a subset of these (CGB-14). Empty = the project itself isn't shared yet. */
  portalClients: { slug: string; name: string }[];
  taskSharingDefault: "all" | "none";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [error, setError] = useState<string>();
  // null (explicit YAML `null`) and undefined (key absent) both mean "no
  // override, follow the project default" — only a real array (including [])
  // is an override. Matches gates.ts canSeeSharedTask's ?? undefined coercion.
  // Derived straight from props (no local state to go stale): the effective
  // client list right now, whether that's an explicit override or the
  // project's default resolved out.
  const sharedWithOverride = task.shared_with ?? undefined;
  const effectiveClients =
    sharedWithOverride ?? (taskSharingDefault === "all" ? portalClients.map((c) => c.slug) : []);
  const childTasks = childrenByParent.get(task.id) ?? [];
  const rowKey = taskId(prefix, task.num);
  const unseenReplies = Math.max(0, countClientReplies(task.description ?? "") - (task.client_replies_seen ?? 0));
  const taskShown = effectiveClients.length > 0;
  const blockedBy = (task.depends_on ?? []).map((id) => allTasks.find((candidate) => candidate.id === id)).filter(Boolean) as Task[];
  const unavailableDependencies = descendantIds(task.id, childrenByParent);
  unavailableDependencies.add(task.id);

  const run = (operation: () => Promise<void>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await operation();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Task update failed");
      }
    });
  };

  const addSubtask = () => {
    const nextTitle = subtaskTitle.trim();
    if (!nextTitle) return;
    setSubtaskTitle("");
    run(() => createTask(slug, nextTitle, "", task.id));
  };

  return (
    <div id={rowKey} className={cn("scroll-mt-20", depth > 0 && "border-l border-border/60 pl-3")} style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      <div className="group border-b border-border/50 last:border-b-0">
        <div className="flex min-h-11 items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={expanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>

          {rowKey && <TaskKey value={rowKey} />}

          <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left">
            <span className={cn("block text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>
              {task.title}
            </span>
            {!expanded && excerpt(task.description) && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{excerpt(task.description)}</span>
            )}
          </button>

          {blockedBy.length > 0 && (
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex" title={blockedBy.map((item) => item.title).join(", ")}>
              <Link2 className="size-3" /> {blockedBy.length}
            </span>
          )}
          {unseenReplies > 0 && (
            <span
              className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
              title="Unreviewed client replies"
            >
              {unseenReplies} new
            </span>
          )}
          {portalClients.length > 0 && (
            <span
              className="flex shrink-0 items-center gap-1"
              onClick={(event) => event.stopPropagation()}
              title={taskShown ? "Shown in the client portal — click to hide" : "Hidden from the client portal — click to share"}
            >
              <Share2 className={cn("size-3.5", taskShown ? "text-emerald-400" : "text-muted-foreground/40")} />
              <Switch
                checked={taskShown}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  run(() => setTaskSharing(slug, task.id, checked ? portalClients.map((c) => c.slug) : []))
                }
                aria-label={taskShown ? "Hide this task from the client portal" : "Share this task in the client portal"}
              />
            </span>
          )}
          {childTasks.length > 0 && <span className="text-[11px] text-muted-foreground">{childTasks.length}</span>}
          <select
            value={task.status}
            disabled={isPending}
            onChange={(event) => run(() => updateTaskStatus(slug, task.id, event.target.value as TaskStatus))}
            aria-label={`Status for ${task.title}`}
            className={cn("h-7 rounded-md border px-2 text-xs outline-none", STATUS_CLASS[task.status])}
          >
            {STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>

        {expanded && (
          <div className="mb-3 ml-7 space-y-4 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`title-${task.id}`}>Title</label>
              <Input id={`title-${task.id}`} value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            {unseenReplies > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2">
                <span className="text-xs text-amber-300">
                  {unseenReplies} new client repl{unseenReplies === 1 ? "y" : "ies"} on this task
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={isPending}
                  onClick={() => run(() => markTaskClientRepliesReviewed(slug, task.id))}
                >
                  Mark reviewed
                </Button>
              </div>
            )}

            {portalClients.length > 0 && (
              <div className="space-y-2 rounded-md border border-border/60 bg-background p-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Share2 className="size-3.5" /> Client portal
                  </span>
                  <label className="flex items-center gap-2">
                    <span className={taskShown ? "text-emerald-400" : "text-muted-foreground"}>
                      {taskShown ? "Shown" : "Hidden"}
                    </span>
                    <Switch
                      checked={taskShown}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        run(() => setTaskSharing(slug, task.id, checked ? portalClients.map((c) => c.slug) : []))
                      }
                    />
                  </label>
                </div>

                {portalClients.length > 1 && (
                  <div className="space-y-1 border-t border-border/50 pt-2">
                    <p className="text-[11px] text-muted-foreground">Share with specific clients</p>
                    {portalClients.map((c) => (
                      <label key={c.slug} className="flex items-center gap-2">
                        <Checkbox
                          checked={effectiveClients.includes(c.slug)}
                          disabled={isPending}
                          onCheckedChange={(checked) => {
                            const next = new Set(effectiveClients);
                            if (checked) next.add(c.slug);
                            else next.delete(c.slug);
                            run(() => setTaskSharing(slug, task.id, [...next]));
                          }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}

                {sharedWithOverride !== undefined && (
                  <button
                    type="button"
                    className="text-[11px] text-sky-400 hover:underline"
                    disabled={isPending}
                    onClick={() => run(() => setTaskSharing(slug, task.id, null))}
                  >
                    Reset to project default ({taskSharingDefault === "all" ? "shown" : "hidden"})
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Details</span>
              <NotesThread
                value={task.description ?? ""}
                onSave={(next) => updateTaskDescription(slug, task.id, next)}
                editorRows={10}
                placeholder="Context, decisions, a running log…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Link2 className="size-3.5" /> Depends on</div>
              {blockedBy.length === 0 ? (
                <p className="text-xs text-muted-foreground">No dependencies.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {blockedBy.map((dep) => (
                    <li
                      key={dep.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 py-1 pr-1.5 pl-2 text-xs"
                    >
                      {taskId(prefix, dep.num) && (
                        <span className="font-mono text-[10px] text-muted-foreground">{taskId(prefix, dep.num)}</span>
                      )}
                      <span className="max-w-48 truncate">{dep.title}</span>
                      <button
                        type="button"
                        disabled={isPending}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        onClick={() =>
                          run(() =>
                            setTaskDependencies(slug, task.id, (task.depends_on ?? []).filter((id) => id !== dep.id)),
                          )
                        }
                        aria-label={`Remove dependency on ${dep.title}`}
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(() => {
                const addable = allTasks.filter(
                  (candidate) => !unavailableDependencies.has(candidate.id) && !(task.depends_on ?? []).includes(candidate.id),
                );
                if (addable.length === 0) return null;
                return (
                  <Select<string>
                    value={null}
                    disabled={isPending}
                    onValueChange={(depId) => {
                      if (!depId) return;
                      run(() => setTaskDependencies(slug, task.id, [...(task.depends_on ?? []), depId]));
                    }}
                  >
                    <SelectTrigger size="sm" className="w-full max-w-xs text-xs">
                      <SelectValue placeholder="+ Add dependency…" />
                    </SelectTrigger>
                    <SelectContent>
                      {addable.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {taskId(prefix, candidate.num) && (
                            <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{taskId(prefix, candidate.num)}</span>
                          )}
                          {candidate.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={isPending || !title.trim()}
                onClick={() => run(() => updateTask(slug, task.id, { title, description: task.description ?? "", dependsOn: task.depends_on ?? [] }))}
              >
                <Save className="size-3.5" /> Save title
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${task.title}”${childTasks.length ? " and all of its sub-tasks" : ""}?`)) run(() => deleteTask(slug, task.id));
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </div>

            <div className="flex items-center gap-2 border-t border-border/50 pt-3">
              <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addSubtask()}
                placeholder="Add sub-task…"
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" disabled={isPending || !subtaskTitle.trim()} onClick={addSubtask}>Add</Button>
            </div>
          </div>
        )}
      </div>

      {childTasks.map((child) => (
        <TaskRow
          key={child.id}
          slug={slug}
          prefix={prefix}
          task={child}
          depth={depth + 1}
          allTasks={allTasks}
          childrenByParent={childrenByParent}
          portalClients={portalClients}
          taskSharingDefault={taskSharingDefault}
        />
      ))}
    </div>
  );
}

export function TaskList({
  slug,
  prefix,
  tasks,
  portalClients = [],
  taskSharingDefault = "none",
}: {
  slug: string;
  prefix: string;
  tasks: Task[];
  /** Clients the project is shared with (CGB-14) — empty if the project isn't
   * shared, in which case no per-task sharing UI renders at all. */
  portalClients?: { slug: string; name: string }[];
  taskSharingDefault?: "all" | "none";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const children = useMemo(() => {
    const result = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.parent_id) continue;
      result.set(task.parent_id, [...(result.get(task.parent_id) ?? []), task]);
    }
    return result;
  }, [tasks]);
  const ids = new Set(tasks.map((task) => task.id));
  const roots = tasks.filter((task) => !task.parent_id || !ids.has(task.parent_id));

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    startTransition(async () => {
      await createTask(slug, title, "");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && addTask()}
          placeholder="Add a top-level task…"
          className="text-sm"
        />
        <Button size="sm" disabled={isPending || !newTitle.trim()} onClick={addTask}><Plus className="size-4" /> Add</Button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
        {STATUSES.map((status) => <span key={status.value}>{status.label}: {tasks.filter((task) => task.status === status.value).length}</span>)}
      </div>

      {roots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60 bg-card px-3">
          {roots.map((task) => (
            <TaskRow
              key={task.id}
              slug={slug}
              prefix={prefix}
              task={task}
              depth={0}
              allTasks={tasks}
              childrenByParent={children}
              portalClients={portalClients}
              taskSharingDefault={taskSharingDefault}
            />
          ))}
        </div>
      )}
    </div>
  );
}
