declare module "bosun-x/lib/activity.mjs" {
  export function resolveTaskKey(task: string, project?: string): Promise<{ project: string; task: string }>;
  export function assignTask(input: {
    task: string;
    project?: string;
    provider: "codex" | "claude";
    session: string;
    host?: string;
  }): Promise<{ project: string; task: string; session: string; provider: string; duplicate: boolean }>;
}
