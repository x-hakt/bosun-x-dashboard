import { z } from "zod";

// "idea"/"designing" used to live here — Planning now fully owns the pre-build
// lifecycle (see PlanningTaskStatusSchema below), so a project.yml record only ever
// describes something real that already exists.
export const ProjectStageSchema = z.enum(["active", "paused", "archived"]);

const ContainerRefSchema = z.object({
  compose_service: z.string().nullish(),
  compose_file: z.string().nullish(),
});

// `.nullish()` throughout: hand-edited YAML commonly uses `field: null` to mean
// "not set yet" rather than omitting the key, and both should be treated the same.
export const ProjectYmlSchema = z.object({
  name: z.string(),
  slug: z.string(),
  display_name: z.string().nullish(),
  // Optional short prefix for task IDs (e.g. "CTRL"); defaults to slug-derived initials.
  key: z.string().nullish(),
  stage: ProjectStageSchema,
  // Real-world product status — deliberately a plain string, not z.enum, so a new
  // value is a data change, not a code change. Known values get styled badges
  // (see ProjectStatusBadge); anything else still renders, just with a neutral style.
  status: z.string().nullish(),
  host: z.string().nullish(),
  path: z.string().nullish(),
  repo: z
    .object({
      url: z.string().nullish(),
      default_branch: z.string().nullish(),
    })
    .nullish(),
  // Legacy single-container field, kept for backward compat — prefer `containers` below.
  container: ContainerRefSchema.nullish(),
  containers: z.array(ContainerRefSchema).nullish(),
  tags: z.array(z.string()).nullish(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).nullish(),
  // Optional link to this project's error tracker (GlitchTip/Sentry/…). bosun-x
  // doesn't run error tracking — this just puts the dashboard one click away.
  error_tracking_url: z.string().nullish(),
  created: z.string().nullish(),
  updated: z.string().nullish(),
  notes: z.string().nullish(),
  // The Planning task id (e.g. "IDEA-3") this project graduated from, if any.
  planning_task: z.string().nullish(),
  // Off-the-shelf/third-party software we run but did not build -- standards checks
  // (SPEC.md, git remote, etc.) are meaningless for these, skip all of them (na).
  vendored: z.boolean().nullish(),
  // Operational flag: something about this record is ambiguous and needs a human
  // look (e.g. an orphaned container found during discovery) -- deliberately NOT a tag,
  // since it is not a tech descriptor. See notes for the actual explanation.
  needs_review: z.boolean().nullish(),
  // Known additional deployments of this same project (a staged migration target, a
  // blue/green pair). Discovery matches these too, so a deliberate second deployment
  // isn't surfaced as "unregistered". The primary host/path above stays authoritative.
  also_on: z
    .array(z.object({ host: z.string(), path: z.string().nullish(), note: z.string().nullish() }))
    .nullish(),
  // ── Client portal (CGB-2.1) ────────────────────────────────────────────────
  // Gate 1: portal slugs (see clients.yml `portals:`) this project is exposed to.
  // Absent/empty = control-panel-only, never visible in any client portal.
  portals: z.array(z.string()).nullish(),
  // Gate 2: client slugs (see clients.yml `clients:`) allowed to see this project
  // in a portal it's exposed to. Absent/empty = only the operator sees it in-portal.
  shared_with: z.array(z.string()).nullish(),
});

export const StandardCheckDefSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string(),
  type: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["required", "recommended", "info"]),
});

export const StandardsYmlSchema = z.object({
  checks: z.array(StandardCheckDefSchema),
});

export const HostSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["lighthouse", "host-node", "workstation"]),
  // The host's address on your private overlay / VPN (WireGuard, Tailscale, Nebula, …).
  // `nebula_ip` is the old name and still accepted; loadHosts() normalises to `mesh_ip`.
  mesh_ip: z.string().nullish(),
  nebula_ip: z.string().nullish(),
  lan_ip: z.string().nullish(),
  public_ip: z.string().nullish(),
  connection: z.string(), // human-readable label for the topology edge, e.g. "mesh VPN"
  live_monitored: z.boolean(),
  ssh_alias: z.string().nullish(),
});

export const HostsYmlSchema = z.object({
  hosts: z.array(HostSchema),
});

// ── Backups (IDEA-10) ────────────────────────────────────────────────────────
// A `backups.yml` per project (sibling of tasks.yml) declares what state needs
// backing up and where it goes; a fleet-level `infra/destinations.yml` lists the
// targets. Both are consumed read-only here — the actual dump/transfer is the
// separate backup agent's job (bosun-x writes config + a request file, never
// holds credentials).

export const DestinationSchema = z.object({
  id: z.string(),
  // cifs-path: a folder on a mounted network share. local-path: a plain
  // directory. b2 / s3: an offsite object-storage bucket (CR-32). restic:
  // reserved.
  kind: z.enum(["cifs-path", "local-path", "restic", "b2", "s3"]),
  path: z.string().nullish(),
  // cifs-path only: the mountpoint the agent must verify is live, plus a sentinel
  // filename under `path` that must exist — guards against a dropped mount
  // silently writing to local disk.
  mount: z.string().nullish(),
  sentinel: z.string().nullish(),
  // b2 / s3 only: the bucket, an optional custom endpoint, the rclone remote
  // name, and the path to a credentials file the *agent* reads — never bosun-x.
  bucket: z.string().nullish(),
  endpoint: z.string().nullish(),
  rclone_remote: z.string().nullish(),
  credential_ref: z.string().nullish(),
  note: z.string().nullish(),
});

export const DestinationsYmlSchema = z.object({
  destinations: z.array(DestinationSchema),
});

export const BackupStoreSchema = z.object({
  name: z.string(),
  kind: z.enum(["postgres", "files", "redis"]),
  // Where it lives — the agent needs enough of these to act, by kind:
  //   postgres  → (container | ssh_alias) + database
  //   files/redis → path | volume
  container: z.string().nullish(),
  ssh_alias: z.string().nullish(),
  database: z.string().nullish(),
  path: z.string().nullish(),
  volume: z.string().nullish(),
  schedule: z.string().nullish(),
  retention: z.object({ keep_last: z.number().int().positive() }).nullish(),
  // Optional client-side encryption: the age recipient (public key) is non-secret
  // and lives here; the matching identity is the restore key, held out of the repo.
  encrypt: z.object({ age_recipient: z.string() }).nullish(),
});

export const BackupsYmlSchema = z.object({
  backup_required: z.boolean().nullish(),
  // How this project is protected:
  //   agent → the backup agent handles `stores`
  //   git   → covered by pushing a git remote (nothing else to back up)
  //   none  → deliberately not backed up (pair with backup_required: false)
  method: z.enum(["agent", "git", "none"]).nullish(),
  // id into destinations.yml (agent method only)
  destination: z.string().nullish(),
  owner: z.string().nullish(),
  stores: z.array(BackupStoreSchema).nullish(),
  notes: z.string().nullish(),
});

export const PlanningTaskStatusSchema = z.enum(["idea", "planning", "ready", "graduated"]);

export const PlanningTaskYmlSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: PlanningTaskStatusSchema,
  type: z.enum(["idea", "note"]).nullish(),
  parent: z.string().nullish(),
  graduated_project: z.string().nullish(),
  created: z.string().nullish(),
  updated: z.string().nullish(),
  // Client portal (CGB-2.1) — same two gates as project.yml. An idea thread can be
  // shared into a portal for a client to follow / (later) reply to.
  portals: z.array(z.string()).nullish(),
  shared_with: z.array(z.string()).nullish(),
});

// ── Client portal registry (CGB-2.1) ─────────────────────────────────────────
// Optional <DATA_DIR>/clients.yml. `portals` are the branded surfaces (one per
// business you run projects "as"); `clients` are the people invited into one.
// Every gate defaults closed: no clients.yml, or a project with no `portals`,
// means nothing is exposed.
export const PortalThemeSchema = z.object({
  // A handful of values the portal layout uses to read as the business's site
  // without vendoring it — CSS colours injected at :root, plus a few strings.
  brand_name: z.string().nullish(),
  tagline: z.string().nullish(), // shown in the footer under the wordmark
  logo_url: z.string().nullish(), // header wordmark image; falls back to brand_name text
  favicon_url: z.string().nullish(), // tab icon for the portal + its login page
  site_url: z.string().nullish(), // "back to <site>" link in the footer
  accent: z.string().nullish(),
  accent_strong: z.string().nullish(),
  paper: z.string().nullish(), // page background base
  surface: z.string().nullish(), // cards / the login panel; defaults to paper
  footer_bg: z.string().nullish(), // footer strip; defaults to a near-black
  ink: z.string().nullish(), // primary text
  ink_soft: z.string().nullish(), // secondary text (nav, captions)
  ink_faint: z.string().nullish(), // hints
  // CSS font-family strings. Omit to use the portal's default (Poppins /
  // Manrope). Naming a Google-hosted family loads it automatically.
  heading_font: z.string().nullish(),
  body_font: z.string().nullish(),
});

export const PortalDefSchema = z.object({
  name: z.string(),
  // Public origin the portal is served from, e.g. https://portal.cgburchell.com —
  // used for magic-link URLs and the allowed redirect.
  url: z.string().nullish(),
  theme: PortalThemeSchema.nullish(),
});

export const ClientDefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  // Which portal (key in `portals`) this client belongs to.
  portal: z.string(),
  // Lower-cased on load. A magic-link request for one of these addresses is honoured.
  emails: z.array(z.string()).nullish(),
  note: z.string().nullish(),
});

export const ClientsYmlSchema = z.object({
  portals: z.record(z.string(), PortalDefSchema).nullish(),
  clients: z.array(ClientDefSchema).nullish(),
});

// ── Instance config (CR-15) ──────────────────────────────────────────────────
// Optional <DATA_DIR>/config.yml. Everything here has a generic default so the
// dashboard runs with no config file at all (single local host, system zone,
// open access, home dir scanned).
export const ConfigYmlSchema = z.object({
  // IANA name for timestamp stamps. Default: the system timezone.
  timezone: z.string().nullish(),
  // Emails allowed to sign in once Google OAuth is configured. Empty/absent means
  // "open" when OAuth env vars are also absent (see auth-config.ts).
  operators: z.array(z.string()).nullish(),
  // hosts.yml id of the machine this dashboard runs on. Default: the one host
  // with no ssh_alias.
  local_host: z.string().nullish(),
  // Local-host directories to scan for docker-compose files / projects. A trailing
  // "/*" scans one level into each subdirectory.
  project_roots: z.array(z.string()).nullish(),
  // Where projects live on a remote host when a project.yml has no explicit path.
  remote_project_path: z.string().nullish(),
  // ssh config for the least-privilege discovery keys.
  ssh_config: z.string().nullish(),
  // Where fleet-backup.sh drops receipts.
  backup_receipts: z.string().nullish(),
  // If your local host runs one big docker-compose project with many sub-apps
  // (each with its own build context), name it here so those sub-apps are grouped
  // per build-context folder instead of as one lump.
  shared_compose_project: z.string().nullish(),
});
