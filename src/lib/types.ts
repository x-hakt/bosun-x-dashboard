export type ProjectStage = "active" | "paused" | "archived";

export interface ProjectLink {
  label: string;
  url: string;
}

export interface ProjectContainer {
  compose_service?: string;
  compose_file?: string;
}

export interface ProjectRepo {
  url?: string;
  default_branch?: string;
}

export interface ProjectMeta {
  name: string;
  slug: string;
  display_name?: string;
  /** Optional short prefix for task IDs (e.g. "CTRL"); falls back to slug-derived initials. */
  key?: string;
  stage: ProjectStage;
  /** Real-world product status (Live/Development/Paused/Abandoned/...) — manually set, distinct from `stage`. */
  status?: string;
  host?: string;
  path?: string;
  repo?: ProjectRepo;
  /** @deprecated prefer `containers` — kept for projects with a single container */
  container?: ProjectContainer;
  containers?: ProjectContainer[];
  tags?: string[];
  links?: ProjectLink[];
  /** Link to this project's error tracker (GlitchTip/Sentry/…) — bosun-x just surfaces it. */
  error_tracking_url?: string;
  created?: string;
  updated?: string;
  notes?: string;
  /** The Planning task (e.g. "IDEA-3") this project graduated from, if any — set once, at creation. */
  planning_task?: string;
  /** Off-the-shelf/third-party software (e.g. Jellyfin, Audiobookshelf) -- standards checks don't apply. */
  vendored?: boolean;
  /** Something about this record is ambiguous and needs a human look -- not a tech tag, see notes field. */
  needs_review?: boolean;
  /** Known additional deployments of this same project (staged migration, blue/green). The
   * primary host/path stays the bosun-x authority; these just stop discovery flagging
   * the extra copy as "unregistered". */
  also_on?: ProjectDeployment[];
  /** Client portal Gate 1 (CGB-2.1): portal slugs this project is exposed to. Empty/absent
   * = control-panel-only. */
  portals?: string[];
  /** Client portal Gate 2 (CGB-2.1): client slugs allowed to see this project in a portal
   * it's exposed to. Empty/absent = operator-only within the portal. */
  shared_with?: string[];
}

export interface ProjectDeployment {
  host: string;
  path?: string;
  note?: string;
}

export type HostRole = "lighthouse" | "host-node" | "workstation";

export interface Host {
  id: string;
  name: string;
  role: HostRole;
  mesh_ip?: string; // private overlay / VPN address; hosts.yml may still use `nebula_ip`
  lan_ip?: string;
  public_ip?: string;
  connection: string;
  live_monitored: boolean;
  ssh_alias?: string; // set only for hosts polled via the least-privilege discovery SSH key
}

// ── Backups (IDEA-10) ────────────────────────────────────────────────────────
export type DestinationKind = "cifs-path" | "local-path" | "restic" | "b2" | "s3";

export interface Destination {
  id: string;
  kind: DestinationKind;
  path?: string;
  mount?: string;
  sentinel?: string;
  bucket?: string;
  endpoint?: string;
  rclone_remote?: string;
  credential_ref?: string;
  note?: string;
}

export type BackupMethod = "agent" | "git" | "none";
export type BackupStoreKind = "postgres" | "files" | "redis";

export interface BackupStore {
  name: string;
  kind: BackupStoreKind;
  container?: string;
  ssh_alias?: string;
  database?: string;
  path?: string;
  volume?: string;
  schedule?: string;
  retention?: { keep_last: number };
  encrypt?: { age_recipient: string };
}

export interface BackupsConfig {
  backup_required: boolean;
  method: BackupMethod;
  destination?: string;
  owner?: string;
  stores: BackupStore[];
  notes?: string;
}

// Runtime status assembled from backups.yml + the agent's receipts.
// "unverified" = the backup itself is fine but the restore test is stale or has
// never run (past the grace window). See fleet-restore-test.sh / CR-29.
export type BackupHealth = "ok" | "unverified" | "stale" | "failing" | "unknown" | "git" | "none";

// The weekly restore-test receipt (fleet-restore-test.sh writes <store>.restore.json).
export interface BackupRestoreStatus {
  testedAt?: string;
  ageHours?: number;
  kind?: string;
  checksumOk: boolean;
  tocEntries?: number;
  tables?: number;
  rows?: number;
  ok: boolean;
  error?: string;
  stale: boolean; // no test, or older than the restore cadence (past grace)
}

export interface BackupStoreStatus {
  name: string;
  kind: BackupStoreKind;
  ok: boolean | null; // null = no receipt seen yet
  lastRunAt?: string;
  ageHours?: number;
  bytes?: number;
  archive?: string;
  error?: string;
  encrypted: boolean;
  scheduleHours: number; // expected cadence, for staleness
  stale: boolean;
  restore: BackupRestoreStatus | null; // null = never restore-tested
}

export interface BackupStatus {
  slug: string;
  required: boolean;
  method: BackupMethod;
  destination?: string;
  health: BackupHealth;
  stores: BackupStoreStatus[];
  notes?: string;
}

export interface ProjectDocs {
  spec?: string;
  status?: string;
  ideas?: string;
  handoff?: string;
}

export interface HandoffState {
  active: boolean;
  agent?: string;
  summary?: string;
  started_at?: string;
  checkpoint_at?: string;
  stale_after_minutes?: number;
  age_minutes?: number;
  stale?: boolean;
  latest?: {
    kind?: "start" | "checkpoint" | "finish";
    work?: string;
    current_state?: string;
    verification?: string;
    next_step?: string;
  };
  // Bounded trail of the last few checkpoints (newest first, index 0 mirrors `latest`);
  // one clipped line each, so trajectory survives a thin checkpoint without loading HANDOFF.md.
  trail?: Array<{
    at?: string;
    kind?: "start" | "checkpoint" | "finish";
    agent?: string;
    work?: string;
  }>;
}

export interface Project {
  meta: ProjectMeta;
  docs: ProjectDocs;
  handoffState?: HandoffState;
  invalid?: string; // set if project.yml failed validation; meta will be a best-effort fallback
}

export type CheckSeverity = "required" | "recommended" | "info";

export interface StandardCheckDef {
  id: string;
  label?: string;
  description: string;
  type: string;
  params?: Record<string, unknown>;
  severity: CheckSeverity;
}

export type CheckStatus = "pass" | "fail" | "na";

export interface CheckResult {
  id: string;
  description: string;
  severity: CheckSeverity;
  status: CheckStatus;
  detail?: string;
}

export interface GitFacts {
  isRepo: boolean;
  hasRemote?: boolean;
  lastCommitDate?: string;
  lastCommitAuthor?: string;
  lastCommitMessage?: string;
  uncommittedCount?: number;
}

// Planning — a fully separate Asana-style task/sub-task system, independent of
// project.yml. A project.yml record should only ever describe a real, already-existing
// thing; ideas/designs live here instead until they "graduate" into one.
export type PlanningTaskStatus = "idea" | "planning" | "ready" | "graduated";

export interface PlanningTask {
  id: string; // "IDEA-3" (top-level) or "IDEA-3.1" (sub-task of IDEA-3)
  title: string;
  status: PlanningTaskStatus;
  /** "idea" (goes through the idea->planning->ready->graduated lifecycle) vs "note"
   * (freeform, not meant to ever graduate — the "not tied to any project" bucket). */
  type: "idea" | "note";
  parent?: string; // set for sub-tasks, e.g. "IDEA-3"
  /** Slug of the resulting project.yml, set once status becomes "graduated". */
  graduated_project?: string;
  created?: string;
  updated?: string;
  /** Client portal (CGB-2.1) — same two gates as ProjectMeta. */
  portals?: string[];
  shared_with?: string[];
}

// ── Client portal (CGB-2.1) ──────────────────────────────────────────────────
export interface PortalTheme {
  brand_name?: string;
  logo_url?: string;
  accent?: string;
  accent_strong?: string;
  paper?: string;
  ink?: string;
  heading_font?: string;
  body_font?: string;
}

export interface Portal {
  slug: string;
  name: string;
  url?: string;
  theme?: PortalTheme;
}

export interface Client {
  slug: string;
  name: string;
  portal: string;
  emails: string[]; // lower-cased on load
  note?: string;
}

export interface PlanningTaskWithDoc {
  meta: PlanningTask;
  notes: string; // NOTES.md content, accumulates as the idea gets fleshed out
  invalid?: string;
}
