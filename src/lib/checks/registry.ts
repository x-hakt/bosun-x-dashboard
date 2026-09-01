import type { CheckResult, CheckStatus, GitFacts, Project, StandardCheckDef } from "@/lib/types";
import { getGitFacts } from "./git";
import { anyFileExists } from "./filesystem";
import { resolveCheckTarget } from "./target";
import { getRemoteFacts } from "./remote-facts";
import { getBackupStatus } from "@/lib/data/backup-status";

type CheckFn = (project: Project, params: Record<string, unknown> | undefined) => Promise<CheckStatus>;

// Shared by every check below — resolves where (if anywhere) this project's git/file
// checks should actually run, then fetches from the right place. Local and remote
// targets end up with the exact same GitFacts/file-presence shape, so callers don't
// need to care which one they got.
async function gitFactsFor(project: Project): Promise<GitFacts> {
  const target = await resolveCheckTarget(project);
  if (target.mode === "local") return getGitFacts(target.path);
  if (target.mode === "remote") return (await getRemoteFacts(target.sshAlias, target.path)).git;
  return { isRepo: false };
}

async function fileExistsFor(project: Project, files: string[]): Promise<boolean | undefined> {
  const target = await resolveCheckTarget(project);
  if (target.mode === "local") return anyFileExists(target.path, files);
  if (target.mode === "remote") {
    const remote = await getRemoteFacts(target.sshAlias, target.path);
    return files.some((f) => remote.files[f]);
  }
  return undefined;
}

const checkFileExists: CheckFn = async (project, params) => {
  const anyOf = (params?.any_of as string[] | undefined) ?? [];
  if (anyOf.length === 0) return "na";
  const exists = await fileExistsFor(project, anyOf);
  if (exists === undefined) return "na";
  return exists ? "pass" : "fail";
};

// A project's central bosun-x document is the canonical portfolio spec.
// A repository-local SPEC.md remains valid too, but is optional: requiring every
// repo to duplicate the central file would create sync jobs and stale copies.
const checkSpecPresent: CheckFn = async (project) => {
  if (project.docs.spec?.trim()) return "pass";
  const exists = await fileExistsFor(project, ["SPEC.md"]);
  if (exists === undefined) return "fail";
  return exists ? "pass" : "fail";
};

const checkGitRepoPresent: CheckFn = async (project) => {
  const target = await resolveCheckTarget(project);
  if (target.mode === "none") return "na";
  const facts = await gitFactsFor(project);
  return facts.isRepo ? "pass" : "fail";
};

const checkGitRemotePresent: CheckFn = async (project) => {
  const target = await resolveCheckTarget(project);
  if (target.mode === "none") return "na";
  const facts = await gitFactsFor(project);
  if (!facts.isRepo) return "na";
  return facts.hasRemote ? "pass" : "fail";
};

const checkHandoffReady: CheckFn = async (project) => {
  const state = project.handoffState;
  return Boolean(
    project.docs.handoff?.trim()
      && state
      && typeof state.active === "boolean"
      && state.agent
      && state.summary
      && state.checkpoint_at
      && Number.isFinite(state.stale_after_minutes)
      && state.latest?.work
      && state.latest.current_state
      && state.latest.verification
      && state.latest.next_step,
  ) ? "pass" : "fail";
};

// IDEA-10 / CR-10. Reads the backup receipts fleet-backup.sh leaves; never runs
// a backup. n/a unless the project's backups.yml opts in with backup_required.
const checkBackupFresh: CheckFn = async (project) => {
  const status = await getBackupStatus(project.meta.slug);
  if (!status || !status.required || status.method === "none") return "na";
  if (status.method === "git") return "pass"; // covered by a git remote (CR-12 / /admin push)
  return status.health === "ok" ? "pass" : "fail";
};

// Fixed lookup table — `type` from standards.yml is only ever used as a key here.
// It never executes arbitrary code from the YAML file itself.
export const registry: Partial<Record<string, CheckFn>> = {
  "file-exists": checkFileExists,
  "spec-present": checkSpecPresent,
  "git-repo-present": checkGitRepoPresent,
  "git-remote-present": checkGitRemotePresent,
  "handoff-ready": checkHandoffReady,
  "backup-fresh": checkBackupFresh,
};

export async function evaluateCheck(project: Project, def: StandardCheckDef): Promise<CheckResult> {
  // Third-party/vendored software (Jellyfin, Audiobookshelf, etc.) isn't something
  // built here — dev-practice checks (SPEC.md, git remote, etc.) are
  // meaningless for it, so every check is n/a regardless of type, not just the ones
  // that happen to already degrade gracefully. Checked here, once, rather than in
  // every individual check function. (resolveCheckTarget() would also return "none"
  // for a vendored project on its own — this short-circuit just avoids the extra
  // lookup and keeps the reason explicit in the detail text.)
  if (project.meta.vendored && !["handoff-ready", "spec-present"].includes(def.type)) {
    return { id: def.id, description: def.description, severity: def.severity, status: "na", detail: "Vendored/third-party software" };
  }

  const fn = registry[def.type];
  if (!fn) {
    return { id: def.id, description: def.description, severity: def.severity, status: "na", detail: `Unknown check type: ${def.type}` };
  }

  // Defensive: every individual check function above already degrades to "na"/"fail"
  // internally rather than throwing, but this is the one guaranteed backstop for the
  // whole evaluation — a check should never surface as a page error, only ever as a
  // clean n/a, even if something unexpected slips through.
  try {
    const status = await fn(project, def.params);
    return { id: def.id, description: def.description, severity: def.severity, status };
  } catch (err) {
    return {
      id: def.id,
      description: def.description,
      severity: def.severity,
      status: "na",
      detail: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
