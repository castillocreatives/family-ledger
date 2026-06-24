---
name: Family Ledger week engine rules
description: Core allowance math rules for the week engine in artifacts/api-server/src/lib/weekEngine.ts
---

## Rules

- All money is stored as **integer cents** (never floats). Display with `centsToDisplay()`.
- **Opening balance** for a new week = `kid.baseAllowanceCents` normally; if previous week closed with negative `rolledOverCents`, then `base + rolledOverCents` (negative, so it reduces the base).
- **Running total** = `openingBalanceCents + sum(entries.amountCents)`
- **Entry signs**: `chore_done` and `bonus` are positive; `chore_missed` and `penalty` are negative (server enforces sign regardless of client input).
- **Close-out**: positive runningTotal → `paidOutCents = runningTotal`, `rolledOverCents = 0`; negative runningTotal → `paidOutCents = 0`, `rolledOverCents = runningTotal` (negative).
- **Payout split modes**: `payout_plans.mode_name` is integer — 0=split (savePct% save), 1=save_all, 2=spend_all.
- **Goal fill**: active goal (oldest incomplete) receives `toSaveCents` first; marks completedAt when savedCents >= targetCents.
- **choreKidsTable** (many-to-many): if a chore has no kidIds, it applies to all kids in the household.

**Why:** Design decision from PRD. Debt rollover prevents kids from "resetting" by spending into negative territory.
