--- Sam · 2026-01-09 ---

Hi Jordan — this is the portal for the recipes API work. You'll see the project
status here, and anything I share for your input. This thread is just for
direct questions either way, no ticket needed.

--- Jordan · 2026-01-12 · client message ---

Got it, thanks. Quick one: is the search change going to need a deploy window,
or does it go out with no downtime?

--- Sam · 2026-01-14 ---

No downtime. The index builds in the background and the `?q=` param only starts
doing anything once it's ready. I'll drop a note here when it's live.
