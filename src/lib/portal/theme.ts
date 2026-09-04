// Portal theme helpers. Pure — no data imports.

import type { CSSProperties } from "react";
import type { PortalTheme } from "@/lib/types";

// The CSS custom properties the portal skin (portal.css) reads. Defaults match
// cgburchell.com; a clients.yml theme overrides any of them.
export function portalThemeVars(t: PortalTheme = {}): CSSProperties {
  return {
    "--portal-accent": t.accent ?? "#2dd4bf",
    "--portal-accent-strong": t.accent_strong ?? "#14b8a6",
    "--portal-paper": t.paper ?? "#141e1f",
    "--portal-surface": t.surface ?? t.paper ?? "#141e1f",
    "--portal-footer-bg": t.footer_bg ?? "#070e0f",
    "--portal-ink": t.ink ?? "#ddeee8",
    "--portal-ink-soft": t.ink_soft ?? "#8db8ae",
    "--portal-ink-faint": t.ink_faint ?? "#4e7068",
    "--portal-line": "rgba(200, 230, 218, 0.08)",
    "--portal-line-strong": "rgba(200, 230, 218, 0.15)",
    // heading/body: a theme string wins; otherwise the next/font variables.
    "--portal-heading-font": t.heading_font ?? "var(--portal-font-heading), system-ui, sans-serif",
    "--portal-body-font": t.body_font ?? "var(--portal-font-body), system-ui, sans-serif",
  } as CSSProperties;
}

// Pull the first family name out of a CSS font-family string:
//   '"Poppins", system-ui, sans-serif'  ->  "Poppins"
export function primaryFamily(cssFontFamily?: string): string | null {
  if (!cssFontFamily) return null;
  const first = cssFontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first || /^(var\(|system-ui|sans-serif|serif|monospace|-apple-system|inherit)/i.test(first)) {
    return null;
  }
  return first;
}

// A Metadata.icons value for the portal favicon — with an explicit svg type so
// browsers prefer it over the app's default app/favicon.ico.
export function portalIcons(faviconUrl?: string): { icon: { url: string; type?: string }[] } | undefined {
  if (!faviconUrl) return undefined;
  const type = /\.svg(\?|$)/i.test(faviconUrl)
    ? "image/svg+xml"
    : /\.png(\?|$)/i.test(faviconUrl)
      ? "image/png"
      : undefined;
  return { icon: [{ url: faviconUrl, ...(type ? { type } : {}) }] };
}

// Build a fonts.googleapis.com css2 URL for whichever of the two theme families
// look like real named fonts. A family Google doesn't have just fails the
// stylesheet load quietly and the CSS fallback stack takes over.
export function googleFontsHref(headingFont?: string, bodyFont?: string): string | null {
  const families = [...new Set([primaryFamily(headingFont), primaryFamily(bodyFont)].filter(Boolean))] as string[];
  if (families.length === 0) return null;
  const params = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400..700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
