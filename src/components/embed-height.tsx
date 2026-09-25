"use client";

import { useEffect } from "react";

// IDEA-20 (BXD-87): the public embed's height changes with the day's sessions, so it tells
// the framing page (x-hakt.com/crew, the only allowed frame ancestor) how tall it is.
const PARENT = "https://x-hakt.com";

export function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "bosun-embed-height", height: Math.ceil(document.documentElement.scrollHeight) }, PARENT);
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
