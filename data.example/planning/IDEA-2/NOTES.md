# Meal-plan builder on top of the recipes API

Not a project yet — a place to work out whether it's worth building.

The pitch: a week view where you drag recipes onto days, and it rolls the
combined ingredients up into one shopping list, de-duplicated and grouped by
aisle. Reuses the recipes API as-is; the meal plan itself is the only new data.

Open questions:
- does the shopping list need quantities scaled to servings, or is "you need
  onions" enough for v1?
- share a plan by link, or keep it private to an account?

--- Jordan · 2026-01-14 · client reply ---

The aisle grouping is the bit our customers would actually use. Quantities can
wait. And yes to a shareable link — people plan meals with a partner.
