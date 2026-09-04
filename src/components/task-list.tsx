"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, CornerDownRight, Link2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTask,
  deleteTask,
  markTaskClientRepliesReviewed,
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
}: {
  slug: string;
  prefix: string;
  task: Task;
  depth: number;
  allTasks: Task[];
  childrenByParent: Map<string, Task[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dependencies, setDependencies] = useState<string[]>(task.depends_on ?? []);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [error, setError] = useState<string>();
  const childTasks = childrenByParent.get(task.id) ?? [];
  const rowKey = taskId(prefix, task.num);
  const unseenReplies = Math.max(0, countClientReplies(task.description ?? "") - (task.client_replies_seen ?? 0));
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
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background p-2">
                {allTasks.filter((candidate) => !unavailableDependencies.has(candidate.id)).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other tasks available.</p>
                ) : allTasks.filter((candidate) => !unavailableDependencies.has(candidate.id)).map((candidate) => (
                  <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={dependencies.includes(candidate.id)}
                      onChange={(event) => setDependencies((current) => event.target.checked
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id))}
                      className="mt-0.5"
                    />
                    <span>
                      {taskId(prefix, candidate.num) && (
                        <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{taskId(prefix, candidate.num)}</span>
                      )}
                      {candidate.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={isPending || !title.trim()} onClick={() => run(() => updateTask(slug, task.id, { title, description: task.description ?? "", dependsOn: dependencies }))}>
                <Save className="size-3.5" /> Save title &amp; links
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
        <TaskRow key={child.id} slug={slug} prefix={prefix} task={child} depth={depth + 1} allTasks={allTasks} childrenByParent={childrenByParent} />
      ))}
    </div>
  );
}

export function TaskList({ slug, prefix, tasks }: { slug: string; prefix: string; tasks: Task[] }) {
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
          {roots.map((task) => <TaskRow key={task.id} slug={slug} prefix={prefix} task={task} depth={0} allTasks={tasks} childrenByParent={children} />)}
        </div>
      )}
    </div>
  );
}
