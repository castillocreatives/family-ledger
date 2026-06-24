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
