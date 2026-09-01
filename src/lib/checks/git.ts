import fs from "node:fs/promises";
import { simpleGit } from "simple-git";
import type { GitFacts } from "@/lib/types";
import { cached } from "@/lib/util/ttl-cache";

const GIT_FACTS_TTL_MS = 20_000;

// Cached because standards evaluation calls this twice per project (git-repo-present
// and git-remote-present each do their own lookup) on every /projects navigation —
// without this, that's 2x the git subprocess spawns for every tracked project, every time.
export async function getGitFacts(projectPath?: string): Promise<GitFacts> {
  if (!projectPath) return { isRepo: false };
  return cached(`git:${projectPath}`, GIT_FACTS_TTL_MS, () => computeGitFacts(projectPath));
}

async function computeGitFacts(projectPath: string): Promise<GitFacts> {

  // A project.yml's `path` is a host filesystem path — it may not exist inside this
  // container (e.g. that part of the host tree isn't bind-mounted). Check up front
  // rather than letting simple-git throw synchronously on a missing baseDir.
  try {
    await fs.access(projectPath);
  } catch {
    return { isRepo: false };
  }

  const git = simpleGit(projectPath);

  let isRepo: boolean;
  try {
    isRepo = await git.checkIsRepo();
  } catch {
    isRepo = false;
  }
  if (!isRepo) return { isRepo: false };

  const facts: GitFacts = { isRepo: true };

  try {
    const remotes = await git.getRemotes();
    facts.hasRemote = remotes.length > 0;
  } catch {
    facts.hasRemote = false;
  }

  try {
    const log = await git.log({ maxCount: 1 });
    if (log.latest) {
      facts.lastCommitDate = log.latest.date;
      facts.lastCommitAuthor = log.latest.author_name;
      facts.lastCommitMessage = log.latest.message;
    }
  } catch {
    // no commits yet
  }

  try {
    const status = await git.status();
    facts.uncommittedCount = status.files.length;
  } catch {
    facts.uncommittedCount = undefined;
  }

  return facts;
}
