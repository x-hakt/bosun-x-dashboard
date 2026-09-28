# The town crier

A project can put a notice on the port's notice board: a count of new items, the latest headline,
and a short line for the ship's log whenever it does something with them. The crier stands by the
board in the town square, ringing his bell while there is news. Up to two notices show at once.

Write `projects/<slug>/crier.json` in the data folder, from whatever gathers that project's news
(a cron job, a collector, a script). The dashboard only reads it.

```json
{
  "label": "Gaming news",
  "public": true,
  "updated": "2026-09-28T09:50:00Z",
  "count": 12,
  "headline": "System Shock 2 is free on the Epic Games Store",
  "url": "https://example.com/the-story",
  "calls": [
    { "id": "n-1a2b3c4d:drafted", "at": "2026-09-28T05:41:00Z", "text": "drafted a post: System Shock 2 is free" }
  ]
}
```

- `label` (required, up to 40 characters) names the notice on the board.
- `updated` (required) is when the notice was last written. A notice not updated for a day is
  taken down.
- `count` is how many new items there are; `headline` the latest (up to 160 characters).
- `url` (https only) is where the crier links on the private page. It never reaches the public page.
- `calls` are lines for the rolling log: "The town crier cried gaming news for <ship>: <text>".
  Each needs a stable `id`, so a line is logged once.
- `public: true` puts the notice, its headline and its calls on the public crew page. Anything
  else is private-page only. Only mark a notice public if every headline and call in it is fine
  for anyone to read.

Every field is checked and clipped when read; a malformed file shows nothing rather than breaking
the port.
