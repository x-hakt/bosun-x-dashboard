"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PORTAL_THEME_KEYS, type PortalThemeKey } from "@/lib/portal-admin-edit";
import {
  savePortalEntry,
  deletePortalEntry,
  saveClientEntry,
  deleteClientEntry,
} from "@/lib/actions/portal-admin";

export interface PortalView {
  slug: string;
  name: string;
  url?: string;
  theme: Partial<Record<PortalThemeKey, string>>;
}
export interface ClientView {
  slug: string;
  name: string;
  portal: string;
  emails: string[];
  note?: string;
}

const THEME_LABELS: Record<PortalThemeKey, string> = {
  brand_name: "Brand name",
  tagline: "Tagline",
  logo_url: "Logo URL",
  favicon_url: "Favicon URL",
  site_url: "Site URL (footer link)",
  contact_email: "Contact email (footer)",
  accent: "Accent",
  accent_strong: "Accent (strong)",
  paper: "Page background",
  surface: "Card / panel background",
  footer_bg: "Footer background",
  ink: "Text",
  ink_soft: "Text (soft)",
  ink_faint: "Text (faint)",
  heading_font: "Heading font-family",
  body_font: "Body font-family",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<void>, after?: () => void) => {
    setError(undefined);
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Save failed");
      }
    });
  };
  return { pending, error, run };
}

// ── Portal ───────────────────────────────────────────────────────────────────

function PortalEditor({ portal, onDone }: { portal?: PortalView; onDone?: () => void }) {
  const isNew = !portal;
  const { pending, error, run } = useAction();
  const [slug, setSlug] = useState(portal?.slug ?? "");
  const [name, setName] = useState(portal?.name ?? "");
  const [url, setUrl] = useState(portal?.url ?? "");
  const [theme, setTheme] = useState<Partial<Record<PortalThemeKey, string>>>(portal?.theme ?? {});
  const [showTheme, setShowTheme] = useState(false);

  const save = () =>
    run(
      () => savePortalEntry(isNew ? slug : portal!.slug, { name, url: url || undefined, theme }),
      () => {
        if (isNew) {
          setSlug("");
          setName("");
          setUrl("");
          setTheme({});
        }
        onDone?.();
      },
    );

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Slug">
          <Input
            value={slug}
            disabled={!isNew}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme"
            className="font-mono"
          />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" />
        </Field>
        <Field label="Portal URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://portal.acme.example" />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setShowTheme((v) => !v)}
        className="text-[11px] font-medium uppercase tracking-wide text-sky-400 hover:underline"
      >
        {showTheme ? "Hide" : "Show"} theme ({Object.values(theme).filter(Boolean).length} set)
      </button>
      {showTheme && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PORTAL_THEME_KEYS.map((key) => (
            <Field key={key} label={THEME_LABELS[key]}>
              <Input
                value={theme[key] ?? ""}
                onChange={(e) => setTheme((t) => ({ ...t, [key]: e.target.value }))}
                placeholder={key.includes("font") ? '"Poppins", sans-serif' : key.includes("url") ? "https://…" : "#2dd4bf"}
              />
            </Field>
          ))}
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Colours are any CSS value; leave blank to use the portal default (dark teal). Naming a Google font
            loads it automatically.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending} onClick={save}>
          <Check className="size-3.5" /> {pending ? "Saving…" : isNew ? "Add portal" : "Save"}
        </Button>
        {isNew ? (
          onDone && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
              <X className="size-3.5" /> Cancel
            </Button>
          )
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete portal "${portal!.slug}"?`)) run(() => deletePortalEntry(portal!.slug));
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

// ── Client ───────────────────────────────────────────────────────────────────

function ClientEditor({
  client,
  portalSlug,
  portals,
  onDone,
}: {
  client?: ClientView;
  portalSlug: string;
  portals: { slug: string; name: string }[];
  onDone?: () => void;
}) {
  const isNew = !client;
  const { pending, error, run } = useAction();
  const [slug, setSlug] = useState(client?.slug ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [portal, setPortal] = useState(client?.portal ?? portalSlug);
  const [emails, setEmails] = useState((client?.emails ?? []).join("\n"));
  const [note, setNote] = useState(client?.note ?? "");

  const save = () =>
    run(
      () =>
        saveClientEntry(isNew ? slug : client!.slug, {
          name,
          portal,
          emails: emails.split(/[\n,]/).map((e) => e.trim()).filter(Boolean),
          note: note || undefined,
        }),
      () => {
        if (isNew) {
          setSlug("");
          setName("");
          setEmails("");
          setNote("");
        }
        onDone?.();
      },
    );

  return (
    <div className="space-y-2.5 rounded-md border border-border/50 bg-background/40 p-2.5">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Field label="Slug">
          <Input
            value={slug}
            disabled={!isNew}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="bob"
            className="font-mono"
          />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bob Client" />
        </Field>
        <Field label="Portal">
          <select
            value={portal}
            onChange={(e) => setPortal(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {portals.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Sign-in emails (one per line)">
        <Textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={2}
          className="font-mono text-xs"
          placeholder="bob@bob-co.example"
        />
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilot client — recipes API only" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={save}>
          <Check className="size-3.5" /> {pending ? "Saving…" : isNew ? "Add client" : "Save"}
        </Button>
        {isNew
          ? onDone && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
                <X className="size-3.5" /> Cancel
              </Button>
            )
          : !isNew && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Remove client "${client!.slug}"?`)) run(() => deleteClientEntry(client!.slug));
                  }}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
                <Link
                  href={`/settings/portals/preview/${client!.slug}`}
                  className="text-xs text-sky-400 hover:underline"
                >
                  View as this client →
                </Link>
              </>
            )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function AddRow({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> {label}
      </Button>
    );
  return <>{children(() => setOpen(false))}</>;
}

// ── Page body ────────────────────────────────────────────────────────────────

export function PortalAdmin({ portals, clients }: { portals: PortalView[]; clients: ClientView[] }) {
  const portalOptions = portals.map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="space-y-6">
      {portals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No portals yet. Add one below, then invite clients into it. Nothing is exposed until a project also
          carries <code className="font-mono text-xs">portals: [slug]</code> and{" "}
          <code className="font-mono text-xs">shared_with: [client]</code>.
        </p>
      )}

      {portals.map((portal) => {
        const members = clients.filter((c) => c.portal === portal.slug);
        return (
          <div key={portal.slug} className="space-y-3">
            <PortalEditor portal={portal} />
            <div className="ml-3 space-y-2 border-l border-border/60 pl-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Clients ({members.length})
              </div>
              {members.map((client) => (
                <ClientEditor
                  key={client.slug}
                  client={client}
                  portalSlug={portal.slug}
                  portals={portalOptions}
                />
              ))}
              <AddRow label="Add client">
                {(close) => (
                  <ClientEditor portalSlug={portal.slug} portals={portalOptions} onDone={close} />
                )}
              </AddRow>
            </div>
          </div>
        );
      })}

      <AddRow label="Add portal">{(close) => <PortalEditor onDone={close} />}</AddRow>
    </div>
  );
}
