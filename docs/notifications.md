# Notifications

The Overview opens with a **Needs you** list when something wants a decision from you, and
the Overview item in the sidebar shows how many. It's meant for things that would
otherwise be forgotten: "pick this week's topics", "a draft is waiting for review", "the
certificate renews next week". Backup and scheduled-job problems don't go here; they
have their own banner at the top of every page.

Built-in sources: **disk** alerts from the capacity sampler (see
[capacity](capacity.md#disk-alerts)).

## Raising one

Anything that can run a command can raise a notification: a cron job, a script, an agent.

```bash
npm run notify -- raise --key planner:topics-week-40 \
  --title "Pick this week's blog topics" \
  --body "7 topic cards waiting" \
  --href https://planner.example.com/launches \
  --level warn            # info (default) | warn | urgent
  # --detail "94.8% used"  a live figure: updates every raise, never brings back a dismissed row
npm run notify -- resolve --key planner:topics-week-40
npm run notify -- list        # what's showing now; --all for everything, --json for scripts
```

- **`--key`** names the thing, not the event. Lowercase letters, digits and `: . _ / -`;
  the part before the first `:` is the source unless you pass `--source`. Raising the same
  key again updates that notification rather than adding another, so a job can raise on
  every run without piling up duplicates.
- **`--href`** is where the row links: a dashboard path (`/projects/recipes-api`) or a full
  URL, which opens in a new tab.
- **`resolve`** is for the source: call it when the thing has been dealt with. If it's
  raised again later it comes back.

## What you can do with one

Each row has **Tomorrow**, **Next week** and **Done**. Snoozed rows come back on their
own. **Done** hides the row until the source raises it with a different title, body or
level. So "7 topic cards waiting" that becomes "9 topic cards waiting" shows again, but
the same message raised by every run stays gone.

## Where it's stored

`notifications.yml` in the data folder, next to `notes.yml`. The dashboard and the
`notify` script share one module (`src/lib/notifications-store.mjs`) that takes a lock and
writes the file atomically, so they can both write at once. Resolved and done
notifications are kept for 30 days and then dropped. `data.example/notifications.yml`
shows the shape.
