// BXD-99: read/write <data>/notifications.yml. Shared by the Next app (server actions) and
// scripts/notify.mjs, which can run at the same time — so every change goes through a lock
// (mkdir, which is atomic) and lands with write-to-temp + rename, never a half-written file.
import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { normalise, prune } from "./notifications-core.mjs";

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;

export const notificationsPath = (dataDir) => path.join(dataDir, "notifications.yml");

/** @param {string} dataDir */
export async function readNotifications(dataDir) {
  try {
    return normalise(loadYaml(await fs.readFile(notificationsPath(dataDir), "utf-8")));
  } catch (err) {
    if (/** @type {any} */ (err).code === "ENOENT") return normalise(null);
    throw err;
  }
}

async function lock(file) {
  const dir = `${file}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      await fs.mkdir(dir);
      return async () => fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      if (/** @type {any} */ (err).code !== "EEXIST") throw err;
      const stat = await fs.stat(dir).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rm(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`notifications are locked (${dir})`);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
}

/**
 * Apply `change` to the file under the lock. `change` gets the current file and returns
 * `{ file, ...rest }`; the new file is pruned and written, and `rest` is handed back.
 * @template R
 * @param {string} dataDir
 * @param {(file: import("./notifications-core.mjs").NotificationsFile) => { file: import("./notifications-core.mjs").NotificationsFile } & R} change
 * @param {Date} [now]
 * @returns {Promise<R>}
 */
export async function updateNotifications(dataDir, change, now = new Date()) {
  const file = notificationsPath(dataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const unlock = await lock(file);
  try {
    const { file: next, ...rest } = change(await readNotifications(dataDir));
    const body =
      "# bosun-x notifications (BXD-99). Written by the dashboard and `npm run notify`;\n" +
      "# see docs/notifications.md. Closed ones are dropped after 30 days.\n" +
      dumpYaml(prune(next, now), { lineWidth: 120, noRefs: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, body, "utf-8");
    await fs.rename(tmp, file);
    return /** @type {R} */ (rest);
  } finally {
    await unlock();
  }
}
