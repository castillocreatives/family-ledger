# Family Ledger — Product Requirements (Replit build)

> **For the builder:** This is a private, install-to-home-screen web app (PWA) for two parents to co-run a weekly allowance system for their kids. Build it as a responsive web app with a real database, email/password auth, and shared multi-user access. Deploy to a live URL. **The allowance math in §4 is the heart of the product — implement it exactly and write tests for it first.**

---

## 1. One-paragraph summary

Family Ledger is a mobile-first web app that replaces a paper allowance book. Each kid starts every week with a base allowance (default $40). Completed chores and good behavior add to that week's running total; missed chores and bad behavior subtract from it. At the end of the week a parent "closes out": a positive total is paid out and the next week resets to the base; a negative total is **debt that rolls over**, so the next week opens *below* base. Two parents share one ledger in real time, and every entry records which parent made it. When a kid is paid, the money is split into **savings** (toward a goal) and **spending** money according to a plan the family sets.

---

## 2. Users & roles (v1)

- **Parent (the only login role in v1).** Two or more parent accounts share one **Household**. All parents have equal read/write access to everything. No "kid login" in v1.
- **Kid** is a *data record* inside a household, not a user account. The kid-facing "My money / goals" screen is a view a parent opens; it is not gated behind a separate login.
- **Phase 2 (note only, do not build yet):** optional limited kid accounts that can view their own balance and goals but not edit chores or close out weeks. Keep the schema friendly to this (see §7) but ship v1 parent-only.

---

## 3. Core objects (plain language)

- **Household** — the shared container. Has a name, a base-allowance default, and 2+ parent members.
- **Parent (member)** — a user belonging to a household. Has name, email, avatar initial, and `role: owner | member`.
- **Kid** — name, optional avatar/color, and a `base_allowance` (defaults to household default, editable per kid).
- **Chore (template)** — a recurring chore: name, point/dollar value, and which kid(s) it applies to. Defined once in Settings; auto-populates each day's tracker. *Dollars and points are the same unit — store cents/integers, display with a `$`.*
- **Week** — a Sun–Sat (configurable start day) period per kid. Has `opening_balance`, a list of entries, a computed `running_total`, and a `status: open | closed`. When closed, stores `paid_out` and `rolled_over` amounts.
- **Entry** — one change to a week's total. Fields: kid, week, type (`chore_done | chore_missed | bonus | penalty`), amount (signed), label, optional note, **the parent who logged it**, and timestamp. `penalty` (remove points) **requires a reason**; `bonus` note is optional.
- **Goal** — a kid's savings target: name, optional picture, `target_amount`, `saved_amount`.
- **Payout plan** — per kid: how a payout splits between **save** and **spend** (e.g. 70/30), or "save it all" / "spend it all".
- **Wallet** — per kid running totals: `saved_balance` and `spend_balance`.

---

## 4. THE RULES — implement exactly, test first

These are the parts most likely to be built subtly wrong. Treat the worked examples as unit tests.

### 4.1 Opening a week
- A new week's **opening balance** is:
  - `base_allowance` if the previous week was paid out or there was no previous week (clean start), **or**
  - `base_allowance − debt` if the previous week closed negative, where `debt = abs(previous running_total)`.
- A week's running total **starts at the opening balance** and changes as entries are added.

### 4.2 During the week
- `running_total = opening_balance + sum(all entry amounts)`.
- Chore done → `+value`. Chore missed → `−value`. Bonus → `+amount`. Penalty → `−amount`.
- The total can go negative mid-week and back up; that's fine. Only the **value at close-out** matters for rollover.

### 4.3 Closing out a week (manual action by a parent)
For each kid:
- If `running_total > 0`: **payout = running_total**, `rolled_over = 0`. Next week opens at `base_allowance` (clean).
- If `running_total < 0`: **payout = 0**, `rolled_over = running_total` (negative). Next week opens at `base_allowance − abs(running_total)`.
- If `running_total == 0`: payout = 0, rolled_over = 0, next week opens at base.
- Closing is **per household but applied to all kids at once** (one "Close out week" action shows every kid's result, then commits).

### 4.4 Worked examples (turn these into tests)
- **Clean positive:** base $40, +$10 chores, +$2 bonus, −$6 missed → total **$46** → pay out $46 → next week opens **$40**.
- **Rollover:** base $40, −$28 missed, −$18 penalty → total **−$6** → pay $0 → next week opens **$34**.
- **Deeper debt:** base $40, ends **−$12** → next week opens **$28**.
- **Debt then recovery:** week opens $28, +$20 net → total **$48** → pay out $48 → following week opens **$40** (debt cleared, back to clean base).
- **Exactly zero:** ends $0 → pay $0, next opens $40.

### 4.5 Payout → wallet split
- When a parent confirms a payout of `P` (P > 0), split per the kid's plan:
  - `to_save = round(P × save_pct)`, `to_spend = P − to_save` (give rounding remainder to spend).
  - "Save it all" → all to `saved_balance`; "Spend it all" → all to `spend_balance`.
- `to_save` first fills the **active goal**; if it would exceed the target, the goal completes and the remainder stays in `saved_balance`. Surface a "goal reached" moment when `saved_amount ≥ target_amount`.
- Marking paid sets the week `status = closed`, writes `paid_out`/`rolled_over`, and creates the next week with the correct opening balance (§4.1).

---

## 5. Screens (build all; mobile-first, bottom tab nav: Home · Daily · Close · History · More)

The attached wireframes (`Family Ledger Wireframes (standalone).html`) show the intended layout and visual direction for every screen below — follow them.

1. **Home / This Week** — one card per kid: name + big weekly running total (green if ≥0, red if <0), base amount, net change, chores progress (e.g. 3/5), and quick **+ Bonus** / **− Points** buttons. A **Close out week →** action at the bottom. Tapping a card → that kid's Daily tracker.
2. **Daily tracker** — for a chosen kid + day: their regular chores as a checklist (tap to mark **done**, can also mark **missed**), plus ad-hoc entries. Show the **day's net** prominently. **+ Add bonus** and **− Remove points** actions. *Removing points opens a sheet that requires a reason; adding a bonus has an optional note.*
3. **Close out week** — the signature moment. Shows each kid's ledger tape (opening → adds → subtracts → total), then the total **counts up/animates to its final number**. Clearly resolves **payout vs. rollover** per kid (positive = pay out, reset to base; negative = rolls over, show next week's lower opening). A confirm step commits and resets the week.
4. **Money & payout** (per kid) — wallet (**saved** vs. **to spend**), active savings **goal** with progress bar, and the kid's **save/spend split** plan. Includes a **new goal** flow (name, target, optional picture, split: save-all / split-slider / spend-all). The **parent payout** view takes a positive week total and routes it per the plan into goal + spending, surfacing "goal reached."
5. **History** — past weeks, newest first. Each week shows, per kid: **paid $X**, or **rolled −$Y → opened $Z**. Tappable for entry detail.
6. **Settings** — under **More**:
   - **Kids & allowance** — add/remove kids (support 1 or many), edit each kid's base allowance.
   - **Regular chores** — list with values; add a chore, edit value, **paste a list** (one chore per line, optional value) to bulk-create.
   - **Shared with** — list of parent members with status; **invite by email or link**. Show owner vs. member.
   - Week start day (default Sunday), household base default.

---

## 6. Two-parent sharing (must-have, build in v1)

- A household **owner** can invite a second parent **by email or shareable link**. Invitee creates an account / signs in and joins the same household.
- Both parents see the **same live data**; changes by one appear for the other (real-time or on refresh — real-time preferred).
- **Every entry stores and displays which parent logged it** (avatar initial + name on entry detail; small marker in lists).

---

## 7. Data model (suggested tables)

`households (id, name, base_default_cents, week_start_dow)`
`members (id, household_id, user_id, name, email, avatar_initial, role)`  — role: owner|member
`kids (id, household_id, name, color, base_allowance_cents)`
`chores (id, household_id, name, value_cents, active)`
`chore_kids (chore_id, kid_id)`  — which kids a chore applies to
`weeks (id, kid_id, start_date, end_date, opening_balance_cents, status, paid_out_cents, rolled_over_cents, closed_at, closed_by_member_id)`
`entries (id, week_id, kid_id, type, amount_cents, label, note, created_by_member_id, created_at)`  — type: chore_done|chore_missed|bonus|penalty
`goals (id, kid_id, name, image_url, target_cents, saved_cents, completed_at)`
`wallets (kid_id, saved_balance_cents, spend_balance_cents)`
`payout_plans (kid_id, mode, save_pct)`  — mode: split|save_all|spend_all

> Store all money as integer **cents**. Never use floats for money. `running_total` is derived, not stored (compute from opening + entries) — but you may cache it.

**Phase-2 friendliness:** `members.role` can later gain a `kid` role; `kids` can later link to an optional `user_id`. Don't build it now.

---

## 8. Visual direction

Editorial, warm-dark. Deep ink background (`#14110d` / cards `#1c1813`), paper-cream text (`#ece4d6`), a single **coin-gold** accent for primary actions (`#d8a657`). Semantic colors are **reserved only for balances/amounts**: green `#7faa6f` positive, red/terracotta `#cf7b67` negative — never for chrome. Big **tabular-numeral monospace** for all balances and amounts (JetBrains Mono or similar) so it reads like a real running tally; a tight modern sans (Space Grotesk or similar) for labels and UI. Disciplined spacing, generous number sizes, minimal decoration. Calm and legible — not a cartoonish kids' app. The **close-out count-up** is the one moment worth extra polish.

## 9. Copy tone

Plain, active, parent-to-parent. Buttons say exactly what happens: "Close out week," "Add bonus," "Remove points," "Mark $46 as paid." Empty states invite action ("Add your first chore"), they don't apologize.

---

## 10. Build order (suggested)

1. Auth + household + invite-second-parent (prove sharing works end-to-end).
2. Kids + chores in Settings.
3. **The week/entry engine + the §4 math, with tests.** Do this before any pretty UI.
4. Home + Daily tracker.
5. Close out week (with the count-up).
6. Money: wallets, goals, payout split.
7. History.
8. PWA polish: manifest, icons, "Add to Home Screen," offline-friendly, optional push for "Dana logged a missed chore."

## 11. Out of scope for v1

Real bank/payment integration (payout is a manual "mark as paid" bookkeeping action, no real money moves). Kid logins. Multiple households per user. Recurring-schedule complexity beyond a flat daily chore list.

## 12. Acceptance checks

- [ ] Two different parent accounts see and edit the same ledger; entries show who logged them.
- [ ] All five §4.4 worked examples produce the exact stated numbers.
- [ ] Removing points is blocked without a reason; bonus note is optional.
- [ ] Closing a positive week pays out and resets to base; closing a negative week rolls debt into a lower opening balance.
- [ ] A payout splits into save/spend per plan and advances the goal; "goal reached" is shown when target is met.
- [ ] Installs to a phone home screen and works as a standalone app.
