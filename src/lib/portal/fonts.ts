import { Poppins, Manrope } from "next/font/google";

// The portal's house typefaces — the same families and weights cgburchell.com
// uses. Loaded (self-hosted) only on portal routes, exposed as CSS variables
// the portal skin reads. A clients.yml theme can still override the family via
// `heading_font` / `body_font` (which then also triggers a Google Fonts link).

export const portalHeadingFont = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--portal-font-heading",
  display: "swap",
});

export const portalBodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--portal-font-body",
  display: "swap",
});
