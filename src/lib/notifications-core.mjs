// BXD-99: notifications, the pure part. Plain JS (like infra/snapshot-sections.mjs) so the
// Next app, the `npm run notify` script and the tests share one implementation.
//
// The file (<data>/notifications.yml) is { seq, notifications: [...] }. A notification is
// raised by a source under a stable `key` ("planner:x-hakt-topics"); raising the same key
// again updates it rather than adding another. The operator can dismiss it (it stays away
// until the source raises it with different wording, e.g. "6 cards" becomes "9 cards") or
// snooze it (until a time). The source resolves it when the thing is dealt with.

/** @typedef {"info" | "warn" | "urgent"} Level */
/** @typedef {"open" | "dismissed" | "resolved"} NotificationState */
/**
 * @typedef {object} Notification
 * @property {string} id
 * @property {string} key
 * @property {string} source
 * @property {Level} level
 * @property {string} title
 * @property {string} [body]
 * @property {string} [detail]     live figure ("94.8% used"); refreshed on every raise, never reopens it
 * @property {string} [href]
 * @property {NotificationState} state
 * @property {string} created
 * @property {string} updated
 * @property {number} count          how many times it has been raised
 * @property {string} [snoozedUntil]
 * @property {string} [closedAt]     when it was dismissed or resolved
 */
/** @typedef {{ seq: number, notifications: Notification[] }} NotificationsFile */

export const LEVELS = /** @type {const} */ (["urgent", "warn", "info"]);
const KEY = /^[a-z0-9][a-z0-9:._/-]{0,119}$/;
export const KEEP_CLOSED_DAYS = 30;
export const MAX_NOTIFICATIONS = 500;

/** @param {unknown} raw @returns {NotificationsFile} */
export function normalise(raw) {
  const data = /** @type {any} */ (raw && typeof raw === "object" ? raw : {});
  const list = Array.isArray(data.notifications) ? data.notifications.filter((n) => n && typeof n.key === "string" && typeof n.id === "string") : [];
  const maxSeq = list.reduce((m, n) => Math.max(m, Number(String(n.id).replace(/^N-/, "")) || 0), 0);
  return { seq: Math.max(Number(data.seq) || 0, maxSeq), notifications: list };
}

/**
 * Raise (or update) the notification for `key`.
 * @param {NotificationsFile} file
 * @param {{ key: string, title: string, body?: string, detail?: string, href?: string, level?: Level, source?: string }} input
 * @param {Date} now
 * @returns {{ file: NotificationsFile, notification: Notification, change: "created" | "updated" | "reopened" | "unchanged" }}
 */
export function raise(file, input, now) {
  if (!KEY.test(input.key)) throw new Error(`bad notification key: ${input.key} (lowercase letters, digits and : . _ / -)`);
  if (!input.title || !input.title.trim()) throw new Error("a notification needs a title");
  const level = input.level ?? "info";
  if (!LEVELS.includes(level)) throw new Error(`level must be one of ${LEVELS.join(", ")}`);
  const at = now.toISOString();
  const fields = {
    title: input.title.trim(),
    ...(input.body ? { body: input.body.trim() } : {}),
    ...(input.detail ? { detail: input.detail.trim() } : {}),
    ...(input.href ? { href: input.href } : {}),
    level,
    source: input.source || input.key.split(":")[0],
  };
  const list = [...file.notifications];
  const i = list.findIndex((n) => n.key === input.key);
  if (i === -1) {
    const seq = file.seq + 1;
    const notification = { id: `N-${seq}`, key: input.key, ...fields, state: /** @type {const} */ ("open"), created: at, updated: at, count: 1 };
    return { file: { seq, notifications: [...list, notification] }, notification, change: "created" };
  }
  const prev = list[i];
  const changed = prev.title !== fields.title || (prev.body ?? "") !== (fields.body ?? "") || prev.level !== fields.level;
  let state = prev.state;
  let change = /** @type {"updated" | "reopened" | "unchanged"} */ (changed ? "updated" : "unchanged");
  // A resolved one always comes back; a dismissed one only when the news changed.
  if (prev.state === "resolved" || (prev.state === "dismissed" && changed)) {
    state = "open";
    change = "reopened";
  }
  const notification = { ...prev, ...fields, state, updated: changed || change === "reopened" ? at : prev.updated, count: prev.count + 1 };
  if (state === "open") delete notification.closedAt;
  if (!input.body) delete notification.body;
  if (!input.detail) delete notification.detail;
  if (!input.href) delete notification.href;
  list[i] = notification;
  return { file: { ...file, notifications: list }, notification, change };
}

/** Close by key because the source says it's dealt with. @param {NotificationsFile} file @param {string} key @param {Date} now */
export function resolve(file, key, now) {
  return close(file, (n) => n.key === key, "resolved", now);
}

/** The operator has seen it. @param {NotificationsFile} file @param {string} id @param {Date} now */
export function dismiss(file, id, now) {
  return close(file, (n) => n.id === id, "dismissed", now);
}

/** @param {NotificationsFile} file @param {(n: Notification) => boolean} match @param {NotificationState} state @param {Date} now */
function close(file, match, state, now) {
  let found = false;
  const notifications = file.notifications.map((n) => {
    if (!match(n) || n.state !== "open") return n;
    found = true;
    const next = { ...n, state, closedAt: now.toISOString() };
    delete next.snoozedUntil;
    return next;
  });
  return { file: { ...file, notifications }, found };
}

/** Hide until `until`. @param {NotificationsFile} file @param {string} id @param {Date} until */
export function snooze(file, id, until) {
  let found = false;
  const notifications = file.notifications.map((n) => {
    if (n.id !== id || n.state !== "open") return n;
    found = true;
    return { ...n, snoozedUntil: until.toISOString() };
  });
  return { file: { ...file, notifications }, found };
}

/** What the operator should see now: open, not snoozed, most urgent first, newest first. @param {NotificationsFile} file @param {Date} now */
export function visible(file, now) {
  const t = now.getTime();
  return file.notifications
    .filter((n) => n.state === "open" && !(n.snoozedUntil && Date.parse(n.snoozedUntil) > t))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.updated.localeCompare(a.updated));
}

/** Drop closed ones after KEEP_CLOSED_DAYS, and cap the file. @param {NotificationsFile} file @param {Date} now */
export function prune(file, now) {
  const cutoff = now.getTime() - KEEP_CLOSED_DAYS * 86_400_000;
  const kept = file.notifications.filter((n) => n.state === "open" || !n.closedAt || Date.parse(n.closedAt) > cutoff);
  const open = kept.filter((n) => n.state === "open");
  const closed = kept.filter((n) => n.state !== "open").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  return { ...file, notifications: [...open, ...closed.slice(0, Math.max(0, MAX_NOTIFICATIONS - open.length))] };
}
