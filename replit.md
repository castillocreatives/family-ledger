# Family Ledger

A mobile-first app for two parents to co-run a weekly kids' allowance system — track chores, close out weeks, and distribute earnings to wallets and savings goals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/mobile run dev` — run the Expo app (mobile preview)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk auth

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + `@clerk/express` middleware
- DB: PostgreSQL + Drizzle ORM (all money as integer cents)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 54, Expo Router v6, `@clerk/expo` v3 (signals API)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/db/src/schema/` — Drizzle ORM table definitions (households, members, invitations, kids, chores, weeks, entries, goals, wallets, payout_plans)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (do NOT edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do NOT edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/weekEngine.ts` — allowance math (opening balance, running total, close-out, payout split)
- `artifacts/api-server/src/middlewares/auth.ts` — `requireAuth` + `requireHousehold` middleware
- `artifacts/mobile/app/` — Expo Router screens
- `artifacts/mobile/constants/colors.ts` — design tokens (warm-dark: #14110d bg, #d8a657 gold)
- `artifacts/mobile/lib/api.ts` — typed fetch wrappers (auto-attaches Clerk bearer token)

## Architecture decisions

- All monetary amounts stored as integer cents (never floats)
- Debt rolls over: if a week closes negative, the deficit carries into the next week's opening balance
- Payout split modes: `split` (save_pct% save, rest spend), `save_all`, `spend_all`
- Clerk Expo v3 uses signals-based API (`signIn.password()`, `signIn.finalize()` — NOT the old `useSignIn().setActive` pattern)
- OpenAPI operationId collision fix: endpoints with both path params AND query params generate two `Params` types of the same name — rename or remove query param to avoid TS2308

## Product

- Email/password auth via Clerk with household creation or invite join
- 5-tab mobile UI: Home (week summary cards), Daily Tracker (chore logging), Close Week (close + payout flow), History (per-kid week archive), More (kids/chores/settings)
- Week math: base allowance + chore completions − chore misses ± bonuses/penalties = running total
- Close-out: positive total → payout to wallet; negative total → rolls into next week
- Payout distribution: save bucket + spend bucket per kid's plan; auto-fills active savings goal

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT run `pnpm dev` at workspace root — artifacts need workflow-provided env vars
- After changing openapi.yaml, run codegen before typechecking
- `choreKidsTable` maps chores to kids (many-to-many) — if empty, chore applies to all kids
- `payout_plans.mode_name` is integer (0=split, 1=save_all, 2=spend_all)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk Expo v3 patterns
