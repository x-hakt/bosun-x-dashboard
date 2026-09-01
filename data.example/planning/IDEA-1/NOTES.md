# Self-hosted read-later app

A place to demonstrate the design/staging view: an idea that hasn't started being
built, so it has no host / path / repo yet.

The pitch: a stripped-down Pocket replacement — a bookmarklet, a reader view, full-
text search, and an RSS-out feed of what's unread. Single binary if possible.

Open questions before this becomes a real project:
- readability extraction: a library, or shell out to a headless browser?
- storage: SQLite is almost certainly enough
- auth: reuse the same OIDC provider as everything else
