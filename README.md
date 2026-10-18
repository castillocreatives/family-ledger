# Family Ledger

A mobile-first app for two parents to co-run a weekly kids' allowance system — track chores, close out weeks, and distribute earnings into spending wallets and savings goals.

Built as a real family tool first: my kids earn, save, and spend through it. The engineering is deliberately boring in the right places (integer cents, idempotent close-outs) and opinionated where it matters (debt rolls over — a negative week carries into the next one, just like real life).

## What it does

- **Daily chore tracking** — log completed chores per kid; assigned paid chores that aren't logged auto-create a `chore_missed` deduction (read-triggered, idempotent, no parent action needed)
- **Weekly close-out** — one flow: opening balance + base allowance + chore completions − misses ± bonuses/penalties = running total
- **Payout plans** — each kid's earnings split into save/spend buckets per their plan (`split`, `save_all`, `spend_all`); payouts auto-fill the active savings goal
- **History** — per-kid week archive, so progress (and patterns) are visible over time
- **Households** — email/password auth via Clerk; create a household or join one via invite

## Stack

- **Mobile:** Expo SDK 54, Expo Router v6, `@clerk/expo` v3
- **API:** Express 5, TypeScript 5.9, OpenAPI spec as the source of truth
- **Data:** PostgreSQL + Drizzle ORM — all money stored as integer cents, never floats
- **Validation/codegen:** Zod (v4) + Orval (OpenAPI → React Query hooks + Zod schemas)
- **Tooling:** pnpm workspaces, esbuild, Node 24

## Run it locally

```bash
# 1. Install
pnpm install

# 2. Set required env vars
#    DATABASE_URL        — Postgres connection string
#    CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY — Clerk auth keys

# 3. Push the schema (dev only)
pnpm --filter @workspace/db run push

# 4. Run the API server (port 8080, proxied at /api)
pnpm --filter @workspace/api-server run dev

# 5. Run the Expo app (mobile preview)
pnpm --filter @workspace/mobile run dev
```

Full check: `pnpm run typecheck` (all packages) · `pnpm run build` (typecheck + build).

After editing `lib/api-spec/openapi.yaml`, regenerate hooks and schemas with `pnpm --filter @workspace/api-spec run codegen` before typechecking.

## Architecture notes

- **Money as integer cents** end to end — no floating-point anywhere near a balance.
- **Debt rolls over:** a week that closes negative carries the deficit into next week's opening balance. Kids learn the same lesson adults do.
- **Generated code is generated:** React Query hooks and Zod schemas come from the OpenAPI spec via Orval — `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are never hand-edited.
- **Allowance math lives in one place:** `artifacts/api-server/src/lib/weekEngine.ts` (opening balance, running total, close-out, payout split).
- **Auto-miss, done right:** unlogged assigned chores become deductions only once per completed day (idempotent); zero-value checklist chores are exempt.

## Where things live

| Path | What |
|---|---|
| `lib/api-spec/openapi.yaml` | OpenAPI spec — source of truth for all endpoints |
| `lib/db/src/schema/` | Drizzle table definitions (households, members, kids, chores, weeks, entries, goals, wallets, payout plans) |
| `artifacts/api-server/src/routes/` | Express route handlers |
| `artifacts/api-server/src/lib/weekEngine.ts` | Allowance math |
| `artifacts/mobile/app/` | Expo Router screens (Home, Daily Tracker, Close Week, History, More) |

## Status & roadmap

Working end to end locally. Next: hosted database (Supabase) and a first deployment. Then: push notifications for close-out day, because no parent remembers it's Sunday.

---

*Practical tools, whimsical spirit.* — [CastilloCreatives](https://github.com/CastilloCreatives)
