import { loadConfig, loadRawConfig } from "@/lib/data/config";
import { loadHosts } from "@/lib/data/hosts";
import { configFile } from "@/lib/data/paths";
import { configuredProviders } from "@/lib/auth-config";
import { ConfigEditor, type ConfigField } from "@/components/config-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = loadConfig();
  const raw = loadRawConfig();
  const hosts = await loadHosts();
  const set = (key: string) => raw[key] !== undefined && raw[key] !== null;

  const noAliasHost = hosts.find((h) => !h.ssh_alias)?.id;
  const remoteHosts = hosts.filter((h) => h.ssh_alias && h.live_monitored && h.id !== (cfg.localHost ?? noAliasHost));

  const timezones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [] as string[];
    }
  })();

  const fields: ConfigField[] = [
    {
      key: "timezone",
      label: "Timezone",
      help: "Used for every timestamp the dashboard writes. Start typing a region and pick from the list — e.g. Europe/London, America/New_York, Asia/Tokyo. These are IANA names, not GMT+10 or UTC. Leave blank to use this machine's own zone.",
      kind: "text",
      placeholder: "e.g. Australia/Sydney",
      options: timezones,
      effective: cfg.timezone ?? "the system zone",
      isDefault: !set("timezone"),
    },
    {
      key: "operators",
      label: "Operators (sign-in allowlist)",
      help: "One email address per line. Only these accounts can sign in (via whichever provider you configured). Leave blank and the dashboard is open to anyone who can reach it — fine on a home network, not on the public internet. An ALLOWED_EMAIL environment variable, if set, overrides this.",
      kind: "list",
      effective: cfg.operators.join(", ") || "none set (env var, or open on your network)",
      isDefault: !set("operators"),
    },
    {
      key: "local_host",
      label: "This machine's host id",
      help: `A short name for the machine the dashboard runs on. It must match an id in infra/hosts.yml${hosts.length ? ` (known: ${hosts.map((h) => h.id).join(", ")})` : ""}. Leave blank and it uses the one host with no ssh_alias.`,
      kind: "text",
      effective: cfg.localHost ?? `${noAliasHost ?? "local"} (the host with no ssh_alias)`,
      isDefault: !set("local_host"),
    },
    {
      key: "project_roots",
      label: "Where your projects are",
      help: "Folders on this machine to search for docker-compose files, one per line. End a line with /* (like /home/me/*) to also look one level inside each subfolder.",
      kind: "list",
      placeholder: "/home/me/apps\n/home/me/*",
      effective: cfg.projectRoots.join(", "),
      isDefault: !set("project_roots"),
    },
    {
      key: "shared_compose_project",
      label: "Shared compose project",
      help: "Only if you run one large docker compose project made of many smaller apps: put its name here so each app is listed separately. Most setups leave this blank.",
      kind: "text",
      effective: cfg.sharedComposeProject ?? "none",
      isDefault: !set("shared_compose_project"),
    },
    {
      key: "remote_project_path",
      label: "Remote project path",
      help: "On another machine reached over SSH, where its projects live when a project doesn't say. Usually /opt or /home/<user>.",
      kind: "text",
      placeholder: "/opt",
      effective: cfg.remoteProjectPath,
      isDefault: !set("remote_project_path"),
    },
    {
      key: "ssh_config",
      label: "SSH config for discovery keys",
      help: "Path to an SSH config file holding the read-only keys used to check other machines. See the 'a key with one job' note for how to make one. Default: ~/.ssh/config.",
      kind: "text",
      effective: cfg.sshConfig,
      isDefault: !set("ssh_config"),
    },
    {
      key: "backup_receipts",
      label: "Backup receipts folder",
      help: "Folder where the backup agent drops its per-project result files. The dashboard only reads these. A BACKUP_RECEIPTS environment variable, if set, overrides this.",
      kind: "text",
      effective: cfg.backupReceipts,
      isDefault: !set("backup_receipts"),
    },
  ];

  const initial: Record<string, string> = {};
  for (const field of fields) {
    const value = raw[field.key];
    initial[field.key] = Array.isArray(value) ? value.join("\n") : value == null ? "" : String(value);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How this dashboard is set up for your environment. Every field has a sensible default, so you only
          need to fill in what&rsquo;s different for you. Under each box, <span className="font-mono text-xs">default:</span>{" "}
          shows what&rsquo;s used when it&rsquo;s left blank and <span className="font-mono text-xs">effective:</span> shows what
          your entry resolves to. Saved to{" "}
          <code className="font-mono text-xs">{configFile()}</code>; a few fields (host and folder scanning) fully
          apply after the next restart.
        </p>
      </div>

      <ConfigEditor fields={fields} initial={initial} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign-in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p className="text-xs text-muted-foreground">
            Providers are set with environment variables, not this file — a change needs a redeploy. See{" "}
            <code className="font-mono">docs/auth.md</code> for Google, GitHub, and generic OIDC (Authentik,
            Keycloak, Auth0, Zitadel…).
          </p>
          {configuredProviders().length > 0 ? (
            configuredProviders().map((p) => (
              <div key={p.id} className="border-t border-border/50 py-1.5 font-mono text-xs">
                {p.label} <span className="text-muted-foreground">({p.id})</span> <span className="text-emerald-400">active</span>
              </div>
            ))
          ) : (
            <p className="border-t border-border/50 py-1.5 font-mono text-xs text-amber-400">
              none configured — the dashboard is open to anyone who can reach it
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hosts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p className="text-xs text-muted-foreground">
            Edit <code className="font-mono">infra/hosts.yml</code> to add or remove hosts. The dashboard sweeps
            every monitored host with an <code className="font-mono text-xs">ssh_alias</code> for discovery.
          </p>
          {hosts.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-3 border-t border-border/50 py-1.5 font-mono text-xs">
              <span>
                {h.id}
                {h.id === (cfg.localHost ?? noAliasHost) && <span className="ml-2 text-emerald-400">local</span>}
                {remoteHosts.some((r) => r.id === h.id) && <span className="ml-2 text-sky-400">swept for discovery</span>}
              </span>
              <span className="text-muted-foreground">{h.ssh_alias ?? "—"}</span>
            </div>
          ))}
          {hosts.length === 0 && <p className="text-xs text-muted-foreground">No hosts.yml found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
