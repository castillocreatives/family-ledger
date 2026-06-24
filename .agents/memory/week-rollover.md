---
name: Week rollover semantics
description: How positive vs negative week balances roll into the next week, and the guard that prevents debt erasure
---

# Week rollover semantics

`weeks.rolledOverCents` carries a balance into the next week's opening balance.
It can be **negative** (debt from a closed-out negative week) or **positive**
(a surplus the user chose to roll forward instead of paying out).

- `getOrCreateCurrentWeek` applies `rolledOverCents !== 0` (not `< 0`) so positive
  surplus also seeds the next week's opening balance.
- The next "current week" is date-based: it materializes only when the calendar
  advances, so a rollover surfaces as `nextOpeningBalanceCents` until then.

## Payout actions (`/weeks/:weekId/payout`, body `{action}`)
`save` / `spend` force the payout split via `processConfirmPayout(forceMode)`.
`rollover` zeroes `paidOutCents` and stores the positive total as `rolledOverCents`.

**Rule:** the `rollover` action is only valid for a **positive** balance.

**Why:** a closed negative week has `paidOutCents = 0` and a negative
`rolledOverCents`. An unguarded rollover branch overwrote `rolledOverCents` with
`0`, silently erasing carried debt — a financial-integrity hole a crafted request
could exploit.

**How to apply:** reject `rollover` when `payoutCents <= 0` (400). Negative totals
are forced to roll over automatically at close-out; the client never offers a
choice for them. Always validate the `action` string against `save|spend|rollover`
before use, and only echo `action` in the response when it was explicitly provided
(otherwise the standing plan decided the split).
