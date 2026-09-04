// Portal theme helpers. Pure — no data imports.

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
