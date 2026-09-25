"use client";

import { useEffect } from "react";

// IDEA-20 (BXD-87): the public embed's height changes with the day's sessions, so it tells
// the framing page (x-hakt.com/crew, the only allowed frame ancestor) how tall it is.
const PARENT = "https://x-hakt.com";

export function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    // The content's own bottom, not the document's: the page fills the frame, so its height
    // would never shrink back once the parent had made the frame taller.
    const main = document.querySelector("main");
    if (!main) return;
    const post = () => {
      const bottom = [...main.children].reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom + window.scrollY), 0);
      window.parent.postMessage({ type: "bosun-embed-height", height: Math.ceil(bottom + 16) }, PARENT);
    };
    const observer = new ResizeObserver(post);
    for (const child of main.children) observer.observe(child);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
