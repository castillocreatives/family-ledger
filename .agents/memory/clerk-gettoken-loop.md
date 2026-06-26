---
name: Clerk getToken effect loop
description: Why auth-bootstrap effects in the Expo app must use a run-once ref guard
---

# Clerk `getToken` is not a stable reference (Expo v3 signals API)

`getToken` returned from `useAuth()` (and other values from Clerk Expo v3's
signals-based hooks) changes identity across renders. Any `useCallback` that
depends on it is recreated every render, and any `useEffect` that depends on
that callback re-fires every render.

**Why it bites:** the app entry screen (`app/index.tsx`) bootstraps by calling
`/households/me` to decide between `/(tabs)` and `/onboarding`. When that check
lived in an effect keyed on the `getToken`-derived callback, it re-ran every
render and reset status back to `"checking"`, so the redirect never stuck. Result:
a permanently blank "loading" screen and a request storm (~28 `GET /households/me`
per second) visible in the API logs.

**How to apply:** gate one-time auth-bootstrap effects with a `useRef` run-once
guard — run the check once when `isLoaded && isSignedIn`, reset the ref on
sign-out. Do NOT rely on the callback/`getToken` being stable in the dep array.
A manual Retry button can call the check function directly, bypassing the guard.

**Deploy note:** the mobile artifact ships a *pre-built static bundle* (see
`scripts/build.js` + `server/serve.js`). Client fixes do not reach the published
`.replit.app` URL until the app is re-published; they do reach dev Expo Go on
Metro reload immediately.
