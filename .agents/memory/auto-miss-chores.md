---
name: Auto-miss chore deductions
description: How incomplete paid chores auto-deduct from a kid's weekly allowance without a parent acting
---

# Auto-miss chore deductions

When a kid's assigned **paid** chore (valueCents > 0) is not logged done/missed on a
**completed** day, the system auto-creates a `chore_missed` entry (negative valueCents)
dated to that day, so the deficit flows into the running total (and rolls into next
week's opening balance if the week closes negative).

Implemented as `materializeAutoMisses(week, kid, {includeToday})` in `weekEngine.ts`,
invoked lazily from the read paths (`/dashboard`, `/weeks/current`) with
`includeToday=false` (today is still in progress) and from `/weeks/close` with
`includeToday=true` (closing finalizes the current day). There is **no cron/scheduler** —
materialization is read-triggered and idempotent.

## Key design decisions

- **`entries.entryDate` (date column) exists because entries only had `createdAt`.**
  A miss for a past day must be dated to that day, not "now", or backfill isn't idempotent.
  Manual entries set `entryDate = today`; auto-misses set it to the specific past day.
- **Dedupe + concurrency safety:** entries gained a nullable `choreId` FK plus a unique
  index `entries_chore_day_uniq` on `(weekId, kidId, entryDate, choreId)`. Auto-misses set
  `choreId` and insert with `.onConflictDoNothing()`.
  **Why:** read-triggered inserts from two parents refreshing at once could otherwise
  double-charge; and label-only dedupe can't tell apart two same-named chores. NULL
  choreId rows (manual/bonus/penalty) are distinct in Postgres, so the index only
  constrains chore-linked rows. Dedupe still also checks label, because the tracker logs
  manual chore done/missed without a choreId.
- **Scope guards:** skips checklist chores (valueCents 0 — no money impact), skips days
  before a chore's `createdAt`, and only days that are complete.

## Known limitations (intentional, not bugs)

- **Day boundaries are UTC-ISO**, consistent with `computeWeekDates`. No household timezone
  is stored; introducing one only for misses would diverge from week boundaries. Revisit
  app-wide if timezone correctness is ever required.
- **Migration boundary:** existing rows got `entryDate = CURRENT_DATE` at migration time,
  so for the single in-flight week at rollout, past-day done entries may be mis-dated and
  trigger spurious auto-misses. Self-corrects from the next week onward.
