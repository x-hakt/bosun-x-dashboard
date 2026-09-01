// Splits a task description / planning NOTES.md blob into conversation "turns" for
// display. The field stays a single plain-markdown document — this is a read-time
// parser, nothing is stored differently, and `grep` still works. The UI renders the
// turns as a thread and edits the whole document behind a toggle.
//
// A turn boundary is either:
//   - a `--- ... ---` fence line (the canonical going-forward form is
//     `--- <Author> · <YYYY-MM-DD>[ · <label>] ---`), or
//   - a line that leads with a header-ish phrase, an ISO date, and an optional
//     `(Author)` — the shapes that grew up organically here
//     (`RESEARCH + BRAINSTORM 2026-08-31 (Claude).`, `DONE 2026-08-30 (Claude), ...`).
// Everything before the first boundary is the opening turn.

export type TurnRole = "agent" | "user" | "neutral";

export interface NoteTurn {
  author?: string;
  date?: string;
  label?: string;
  role: TurnRole;
  body: string;
}

const AGENT_RE = /^(claude|codex|gpt|chatgpt|assistant|ai|sonnet|opus|haiku|cursor|copilot|gemini)\b/i;
const USER_RE = /^(user|you|me|human|operator|op)\b/i;

function roleFor(author?: string): TurnRole {
  if (!author) return "neutral";
  if (AGENT_RE.test(author)) return "agent";
  if (USER_RE.test(author)) return "user";
  return "neutral";
}

const FENCE_RE = /^\s*(?:-{2,}|={2,}|#{1,4})\s*(.+?)\s*(?:-{2,}|={2,})?\s*$/;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;

// A non-fenced lead only counts if it reads like a header: all-caps (spaces / + / & / -
// allowed) or one of a small set of status verbs, then an ISO date on the same line.
const LEAD_RE = /^([A-Za-z][\w +/&-]{1,48}?)\s+(\d{4}-\d{2}-\d{2})[.,:]?(?:\s*\(([^)]+)\))?/;
const LEAD_VERBS = /^(Done|Shipped|Prepped|Fixed|Added|Blocked|Update|Updated|Note|Noted|Decomposed|Research|Direction|Resolved)\b/;

function isHeadery(phrase: string): boolean {
  const p = phrase.trim();
  return p.length >= 3 && (p === p.toUpperCase() || LEAD_VERBS.test(p));
}

// Trims commit-sha / "commit x@y" tails and surrounding punctuation off a label, and
// caps its length so a run-on header doesn't blow out the thread UI.
function cleanLabel(raw: string): string {
  let s = raw
    .replace(/[,;:]?\s*commit\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,:–—-]+|[\s.,:–—-]+$/g, "")
    .trim();
  if (s.length > 48) s = `${s.slice(0, 47).trimEnd()}…`;
  return s;
}

function parseHeaderText(text: string): { author?: string; date?: string; label?: string } {
  const date = text.match(DATE_RE)?.[0];
  const paren = text.match(/\(([^)]*)\)/)?.[1];
  let author: string | undefined;

  if (paren !== undefined) {
    const parts = paren.split(/[,·]/).map((p) => p.trim()).filter(Boolean);
    author = parts.find((p) => !DATE_RE.test(p) && !/^commit\b/i.test(p) && !/@/.test(p));
  }

  // The label is whatever's left after stripping the date, the (parenthetical), and any
  // "·" separators — e.g. `DIRECTION PASS 2 (2026-09-01, Claude)` -> "DIRECTION PASS 2".
  let label = cleanLabel(
    text
      .replace(/\([^)]*\)/g, "")
      .replace(DATE_RE, "")
      .replace(/·/g, " "),
  );

  // If the "label" is really just the author (`--- Claude · 2026-09-01 ---`), don't
  // repeat it.
  if (!author && label && !/\s/.test(label) && (AGENT_RE.test(label) || USER_RE.test(label))) {
    author = label;
    label = "";
  }

  return { author, date, label: label || undefined };
}

interface Boundary {
  line: number;
  meta: { author?: string; date?: string; label?: string };
  dropFirstLine: boolean; // fence lines are dropped whole; lead lines keep their remainder
  firstLineRemainder: string;
}

export function parseNoteThread(content: string): NoteTurn[] {
  const text = (content ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const boundaries: Boundary[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    const fence = raw.match(FENCE_RE);
    if (fence && /^\s*(-{2,}|={2,}|#{1,4})/.test(raw) && DATE_RE.test(fence[1])) {
      boundaries.push({ line: i, meta: parseHeaderText(fence[1]), dropFirstLine: true, firstLineRemainder: "" });
      continue;
    }

    const lead = raw.match(LEAD_RE);
    if (lead && isHeadery(lead[1])) {
      const label = cleanLabel(lead[1]);
      const author = lead[3]
        ? lead[3].split(/[,·]/).map((p) => p.trim()).find((p) => !DATE_RE.test(p) && !/^commit\b/i.test(p) && !/@/.test(p))
        : undefined;
      boundaries.push({
        line: i,
        meta: { author, date: lead[2], label: label || undefined },
        dropFirstLine: false,
        firstLineRemainder: raw.slice(lead[0].length).replace(/^[\s.,:)–—-]+/, ""),
      });
    }
  }

  const turns: NoteTurn[] = [];
  const push = (from: number, to: number, boundary?: Boundary) => {
    let bodyLines = lines.slice(from, to);
    if (boundary) {
      bodyLines = boundary.dropFirstLine
        ? bodyLines.slice(1)
        : [boundary.firstLineRemainder, ...bodyLines.slice(1)];
    }
    const body = bodyLines.join("\n").replace(/^\n+|\n+$/g, "").trimEnd();
    const meta = boundary?.meta ?? {};
    if (!body.trim() && !meta.label && !meta.author) return;
    turns.push({ ...meta, role: roleFor(meta.author), body });
  };

  if (boundaries.length === 0) return [{ role: "neutral", body: text.trim() }];

  if (boundaries[0].line > 0) push(0, boundaries[0].line);
  for (let b = 0; b < boundaries.length; b += 1) {
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line : lines.length;
    push(boundaries[b].line, end, boundaries[b]);
  }

  return turns;
}

// The canonical header the UI inserts for a new human note and that agents should use.
export function noteTurnHeader(author: string, date = new Date().toISOString().slice(0, 10), label?: string): string {
  return `--- ${author} · ${date}${label ? ` · ${label}` : ""} ---`;
}
