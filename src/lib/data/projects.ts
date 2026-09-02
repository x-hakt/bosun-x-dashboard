import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { projectsDir } from "./paths";
import { ProjectYmlSchema } from "./schema";
import { readMarkdownIfExists } from "./markdown";
import type { HandoffState, Project, ProjectMeta } from "@/lib/types";
import type { z } from "zod";
import { dateStamp } from "@/lib/time/stamp";

function normalizeContainerRef(c: { compose_service?: string | null; compose_file?: string | null }) {
  return { compose_service: c.compose_service ?? undefined, compose_file: c.compose_file ?? undefined };
}

// zod's `.nullish()` fields parse to `T | null`, but the rest of the app treats
// "unset" as plain `undefined` — normalize once at the data-loading boundary.
function normalizeMeta(raw: z.infer<typeof ProjectYmlSchema>): ProjectMeta {
  return {
    name: raw.name,
    slug: raw.slug,
    display_name: raw.display_name ?? undefined,
    key: raw.key ?? undefined,
    stage: raw.stage,
    status: raw.status ?? undefined,
    host: raw.host ?? undefined,
    path: raw.path ?? undefined,
    repo: raw.repo
      ? { url: raw.repo.url ?? undefined, default_branch: raw.repo.default_branch ?? undefined }
      : undefined,
    container: raw.container ? normalizeContainerRef(raw.container) : undefined,
    containers: raw.containers ? raw.containers.map(normalizeContainerRef) : undefined,
    tags: raw.tags ?? undefined,
    links: raw.links ?? undefined,
    error_tracking_url: raw.error_tracking_url ?? undefined,
    created: raw.created ?? undefined,
    updated: raw.updated ?? undefined,
    notes: raw.notes ?? undefined,
    planning_task: raw.planning_task ?? undefined,
    vendored: raw.vendored ?? undefined,
    needs_review: raw.needs_review ?? undefined,
    also_on: raw.also_on
      ? raw.also_on.map((d) => ({ host: d.host, path: d.path ?? undefined, note: d.note ?? undefined }))
      : undefined,
  };
}

function projectYmlPath(slug: string): string {
  return path.join(projectsDir(), slug, "project.yml");
}

async function loadProjectDir(slug: string): Promise<Project | null> {
  const dir = path.join(projectsDir(), slug);
  let raw: string;
  try {
    raw = await fs.readFile(projectYmlPath(slug), "utf-8");
  } catch {
    return null;
  }

  const parsed = ProjectYmlSchema.safeParse(loadYaml(raw));

  const [spec, status, ideas, handoff, handoffStateRaw] = await Promise.all([
    readMarkdownIfExists(path.join(dir, "SPEC.md")),
    readMarkdownIfExists(path.join(dir, "STATUS.md")),
    readMarkdownIfExists(path.join(dir, "IDEAS.md")),
    readMarkdownIfExists(path.join(dir, "HANDOFF.md")),
    fs.readFile(path.join(dir, "HANDOFF.yml"), "utf-8").catch(() => ""),
  ]);
  const handoffState = handoffStateRaw ? (loadYaml(handoffStateRaw) as HandoffState) : undefined;
  if (handoffState?.checkpoint_at) {
    handoffState.age_minutes = Math.max(0, Math.floor((Date.now() - Date.parse(handoffState.checkpoint_at)) / 60000));
    handoffState.stale = Boolean(
      handoffState.active && handoffState.age_minutes > (handoffState.stale_after_minutes ?? 30),
    );
  }

  if (!parsed.success) {
    // "active" here is just a safe schema-valid default for a record that failed
    // validation — projects no longer have an "idea"/pre-build stage at all (that's
    // Planning's job now); the `invalid` message is what actually surfaces the problem.
    return {
      meta: { name: slug, slug, stage: "active" },
      docs: { spec, status, ideas, handoff },
      handoffState,
      invalid: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  return { meta: normalizeMeta(parsed.data), docs: { spec, status, ideas, handoff }, handoffState };
}

export async function listProjects(): Promise<Project[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(projectsDir(), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const projects = await Promise.all(entries.map(loadProjectDir));
  return projects.filter((p): p is Project => p !== null);
}

export async function getProject(slug: string): Promise<Project | null> {
  return loadProjectDir(slug);
}

// Rewrites project.yml with a shallow patch merged over the raw parsed YAML (not
// the normalized meta, so unrelated fields/comments-adjacent structure survive as-is).
// Used only for narrow, deliberate edits (e.g. renaming) — never for bulk writes.
export async function patchProjectYaml(slug: string, patch: Record<string, unknown>): Promise<void> {
  const filePath = projectYmlPath(slug);
  const raw = await fs.readFile(filePath, "utf-8");
  const current = (loadYaml(raw) as Record<string, unknown>) ?? {};
  const next = { ...current, ...patch };
  await fs.writeFile(filePath, dumpYaml(next), "utf-8");
}

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugFromDisplayName(displayName: string): string {
  const withoutDomainSuffix = displayName.trim().replace(/\.(?:com\.au|com|net|org|app|io)$/i, "");
  const slug = withoutDomainSuffix
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || !SAFE_SLUG.test(slug)) throw new Error("The project name does not produce a valid URL slug.");
  return slug;
}

export async function renameProjectDirectory(currentSlug: string, displayName: string): Promise<string> {
  if (!SAFE_SLUG.test(currentSlug)) throw new Error("Invalid current project slug.");
  const nextSlug = slugFromDisplayName(displayName);
  if (nextSlug === currentSlug) {
    await patchProjectYaml(currentSlug, {
      display_name: displayName,
      updated: dateStamp(),
    });
    return currentSlug;
  }

  const currentDir = path.join(projectsDir(), currentSlug);
  const nextDir = path.join(projectsDir(), nextSlug);
  try {
    await fs.access(nextDir);
    throw new Error(`A project already uses the slug ${nextSlug}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.rename(currentDir, nextDir);
  try {
    await patchProjectYaml(nextSlug, {
      slug: nextSlug,
      display_name: displayName,
      updated: dateStamp(),
    });
  } catch (error) {
    await fs.rename(nextDir, currentDir);
    throw error;
  }
  return nextSlug;
}
