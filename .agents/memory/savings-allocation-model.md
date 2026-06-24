---
name: Savings allocation model
description: How a kid's saved money relates to savings goals, and how to pick the "active" goal.
---

# Savings allocation model

- `walletsTable.savedBalanceCents` is the kid's **total** saved bucket.
- Each `goalsTable.savedCents` is an **earmark** allocated out of that bucket toward one goal — it is NOT separate money.
- **Unallocated savings** = `savedBalanceCents − sum(goals.savedCents)`. This is the pool a parent can still assign.
- "Apply savings to a goal" (`POST /goals/:id/contribute`) moves unallocated savings into a goal: it increments `goal.savedCents` only and does **not** change `savedBalanceCents`. Applied amount is capped at `min(requested, unallocated, remaining_need)`.

**Why:** the close-week payout (`processConfirmPayout` in weekEngine.ts) increments BOTH `savedBalanceCents` and the active goal's `savedCents` in parallel — so a goal's savedCents is a view/earmark of the bucket, never additional money. Manual contribution must follow the same model or totals double-count.

**How to apply:** any code that funds or reports goal progress must treat goal.savedCents as a subset of savedBalanceCents. Concurrent contributions must lock rows (transaction + `.for("update")` on wallet + the kid's goals) or two requests can both read the same unallocated balance and over-allocate.

## Active goal selection

- The "active goal" is the **oldest incomplete** goal. Query it with `where(eq(kidId), isNull(completedAt)).orderBy(createdAt).limit(1)`.
- Do NOT select the oldest goal first and then filter `completedAt` in app code — that wrongly reports "no active goal" (and stops payout auto-fill) whenever the oldest goal is already complete but newer incomplete goals exist.
- This rule applies in every place that resolves the active goal: `weekEngine.processConfirmPayout`, the `/dashboard` route, and any future caller.
