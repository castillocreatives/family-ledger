---
name: React Native Share API fails silently in Expo web preview
description: Why native-only RN APIs break in the Replit web preview and how to make them cross-platform
---

# RN `Share.share()` (and similar native APIs) fail silently on Expo web

The Replit mobile preview renders the Expo app as **react-native-web** (URL `*.expo.riker.replit.dev`), not a native device. `Share.share()` from `react-native` rejects/no-ops on web, so a button that "just calls Share" appears to do nothing — even with a react-query `onError`, the rejected promise inside `onSuccess` is unhandled and produces no user feedback.

**Why:** users test in the web preview first. Native-only APIs (Share, some Clipboard paths, Linking edge cases) silently fail there and read as "feature is broken."

**How to apply:** for any share/copy/native-bridge action, branch on `Platform.OS === "web"`:
- Web: use `navigator.share` if present, else fall back to clipboard copy.
- Native: use the RN/Expo API, wrapped in try/catch that falls back to copy.
Always give visible feedback (modal with the value + "Copy"/"Copied ✓") rather than relying solely on a system share sheet. Use `expo-clipboard` (`Clipboard.setStringAsync`) — installed in @workspace/mobile.

The household invite flow is a code (token) pasted into Onboarding → "Join with invite code" → POST /invitations/accept. It is not a deep link; the share message just carries the code.

## `Alert.alert` with buttons also breaks on web
`Alert.alert(title, msg, [buttons])` on react-native-web shows the message but **does not fire button `onPress` callbacks**. Any confirm/destructive action wired through Alert buttons (sign out, delete kid/chore) silently does nothing in the preview. Use a state-driven `<Modal>` confirm instead (see the sign-out / invite modals in `more.tsx`). Single-button informational `Alert.alert(title, msg)` is fine.

## Clerk token timing on web: singleton session lags behind `useAuth().isSignedIn`
On Expo web's first load, `useAuth().isSignedIn` can be `true` while the Clerk **singleton** (`getClerkInstance().session`) is still null for a tick, so a module-level `getClerkInstance().session?.getToken()` returns null → the request 401s. For routing/auth-gating right after load, use the reactive `getToken` from the `useAuth()` hook (resolves once the session is ready) and pass it explicitly, and/or auto-retry transient 401s before showing an error/dead-end. Symptom seen: signed-in user with no household stuck on an "error/Retry" screen instead of routing to onboarding.
