# Handoff Log

Append-only, newest entry on top.

---

## 2026-01-14T15:30:00.000+00:00 — Claude

**Checkpoint**: Added a tsvector column + GIN index in a migration; the list
endpoint accepts `?q=` and filters on it.

**Tasks**: RCP-2 (in progress)

**Current state**: Migration runs clean on a copy of prod. Titles are searchable;
ingredient matching is partial (ingredients are a JSON column, not yet in the tsvector).

**Verification**: 28 API tests pass; `?q=lemon` returns the expected 3 recipes.

**Next step**: Fold the ingredients JSON into the tsvector trigger, re-run the migration test.

---

## 2026-01-14T14:00:00.000+00:00 — Claude

**Work started**: RCP-2 — full-text search over recipe titles and ingredients.
