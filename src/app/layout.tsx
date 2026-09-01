import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "bosun-x",
  description: "Projects, infrastructure, and design staging in one place.",
  // Favicon set — keeps the dashboard identifiable in a crowded tab bar.
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: { url: "/apple-touch-icon.png" },
  },
};

// The app chrome (sidebar, top bar) lives in (app)/layout.tsx so that /login
// renders on its own, without the dashboard behind the sign-in card.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
