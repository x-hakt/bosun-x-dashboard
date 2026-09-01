"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveConfig } from "@/lib/actions/config";

export interface ConfigField {
  key: string;
  label: string;
  help: string;
  kind: "text" | "list";
  placeholder?: string;
  /** a themed typeahead over these suggestions instead of a plain text input */
  options?: string[];
  /** the resolved value, shown under the input */
  effective: string;
  /** true when the key isn't set in config.yml (so `effective` is the default) */
  isDefault: boolean;
}

// A text input with a themed filtered dropdown — used for the timezone field so it
// matches the rest of the form instead of the browser's native <datalist> chrome.
function Combobox({
  id,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 80);
  const exact = options.some((o) => o.toLowerCase() === q);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="font-mono text-sm"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
      />
      {open && matches.length > 0 && !(exact && matches.length === 1) && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
        >
          {matches.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={opt.toLowerCase() === q}
                className={cn(
                  "block w-full px-3 py-1.5 text-left font-mono text-xs",
                  opt.toLowerCase() === q ? "bg-accent text-foreground" : "hover:bg-accent/60",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConfigEditor({ fields, initial }: { fields: ConfigField[]; initial: Record<string, string> }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(true);

  const set = (key: string, value: string) => {
    setValues((s) => ({ ...s, [key]: value }));
    setSaved(false);
    setError(undefined);
  };

  const save = () =>
    startTransition(async () => {
      try {
        const patch: Record<string, string | string[]> = {};
        for (const field of fields) {
          const value = values[field.key] ?? "";
          patch[field.key] =
            field.kind === "list" ? value.split("\n").map((s) => s.trim()).filter(Boolean) : value.trim();
        }
        await saveConfig(patch);
        setSaved(true);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Save failed");
      }
    });

  return (
    <div className="space-y-6">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor={`cfg-${field.key}`}>{field.label}</label>
          <p className="text-xs text-muted-foreground max-w-prose">{field.help}</p>
          {field.kind === "list" ? (
            <Textarea
              id={`cfg-${field.key}`}
              value={values[field.key] ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
              rows={3}
              className="font-mono text-sm"
              placeholder={field.placeholder}
            />
          ) : field.options && field.options.length > 0 ? (
            <Combobox
              id={`cfg-${field.key}`}
              value={values[field.key] ?? ""}
              options={field.options}
              placeholder={field.placeholder}
              onChange={(v) => set(field.key, v)}
            />
          ) : (
            <Input
              id={`cfg-${field.key}`}
              value={values[field.key] ?? ""}
              onChange={(e) => set(field.key, e.target.value)}
              className="font-mono text-sm"
              placeholder={field.placeholder}
              autoComplete="off"
            />
          )}
          <p className="text-[11px] font-mono text-muted-foreground/70">
            {field.isDefault ? "default" : "effective"}: {field.effective || "(none)"}
          </p>
        </div>
      ))}

      <div className="flex items-center gap-3 border-t border-border/60 pt-4">
        <Button size="sm" disabled={isPending || saved} onClick={save}>
          {isPending ? "Saving…" : "Save config"}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
