# Notifications

The Overview opens with a **Needs you** list when something wants a decision from you, and
the Overview item in the sidebar shows how many. It's meant for things that would
otherwise be forgotten: "pick this week's topics", "a draft is waiting for review", "the
certificate renews next week". Backup and scheduled-job problems don't go here; they
have their own banner at the top of every page.

Built-in sources: **disk** alerts from the capacity sampler (see
[capacity](capacity.md#disk-alerts)), and **reboot** alerts from the boot check (below).

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

## Reboot alerts

`scripts/boot-check.mjs` (BXD-112) notices when the host the dashboard runs on has rebooted
and whether anyone asked it to. It reads systemd's boot list; for each boot that has ended,
the last few hundred journal lines either show a shutdown being started ("Journal stopped",
"Reached target shutdown.target", "System is powering down", ...) or they just stop. A
journal that just stops is an **unclean** reboot: lost power, a hardware reset, or a hang
somebody power-cycled.

Each reboot is one line in `<receipts>/_events/reboots.jsonl`: when it went down and came
back, for how long, whether it was clean, and the load and memory from the last capacity
sample before it went down. An unclean one raises `reboot:<host>`:

- **warn** for one unclean reboot in the window, **urgent** from `urgent_at` (default 2). An
  urgent alert stays urgent until it clears.
- The body names the latest one ("Went down at Fri 2 Oct, 10:02 without shutting down, back up
  at 10:03 (55 s later). Just before: load 3.56, memory 6.2 GB of 16.6 GB."), so **Done**
  holds until there's a new unclean reboot. The count ("3 unclean in 7 days") is the live
  figure and never reopens a dismissed row.
- It clears itself after `window_days` (default 7) without one.

Run it at boot and hourly (it records each reboot once, and the hourly run is what clears a
quiet week):

```bash
@reboot   sleep 120; /path/to/bosun-x-dashboard/scripts/lib/job-run.sh boot-check --label "Boot check" --family watchman --every 1h -- /usr/bin/node /path/to/bosun-x-dashboard/scripts/boot-check.mjs
23 * * * * /path/to/bosun-x-dashboard/scripts/lib/job-run.sh boot-check --label "Boot check" --family watchman --every 1h -- /usr/bin/node /path/to/bosun-x-dashboard/scripts/boot-check.mjs
```

The user running it needs to read the system journal (the `adm` or `systemd-journal`
group). `--dry-run` prints what it would record and raise without writing anything;
`--host <id>` says which `infra/hosts.yml` host this is when the hostname doesn't match.
`reboot_alerts: false` in `config.yml` turns the alert off (reboots are still recorded).
The port shows each unclean reboot as a [squall](activity.md#squalls-bxd-112).
