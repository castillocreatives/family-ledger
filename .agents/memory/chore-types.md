---
name: Chore types (checklist vs paid)
description: How the two kinds of chores are distinguished and why
---

# Checklist vs paid chores

A chore's kind is encoded entirely by `chores.valueCents`:
- `valueCents > 0` → **paid chore**: Done = +value, Miss = −value (real money impact via entries).
- `valueCents === 0` → **checklist chore**: just an expectation tied to the kid's base allowance. Checking it logs a `chore_done` entry with `amountCents: 0`, so running totals and close-out math are unaffected. Tracker renders it as a simple checkbox (no Miss button, no $ shown).

**Why:** the user wanted a checklist that doesn't require a per-chore dollar amount. Rather than add a boolean flag + DB migration, 0-value is the implicit discriminator. `ChoreInput.valueCents` is optional (default 0) in the OpenAPI spec.

**How to apply:** any new chore UI/analytics must treat `valueCents === 0` as checklist. Do not assume every chore has a positive value.

**Known fragility (pre-existing, not yet fixed):** tracker matches a chore to its day entry by `entry.label === chore.name`, not by id. Renames or duplicate-named chores can toggle the wrong entry. Fixing properly needs a `choreId` column on entries (schema migration).
