---
name: Clerk Expo v3 signals API
description: @clerk/expo v3 uses a React signals/future-based API, not the classic hook destructuring pattern from v1/v2.
---

## Rule

Use the signals-based API from `@clerk/expo` v3. Do NOT use the old `setActive`, `isLoaded` pattern.

**Sign in:**
```ts
const { signIn, errors, fetchStatus } = useSignIn();
await signIn.password({ emailAddress, password });
if (signIn.status === 'complete') {
  await signIn.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/')) });
}
```

**Sign up:**
```ts
const { signUp, errors, fetchStatus } = useSignUp();
await signUp.password({ emailAddress, password });
await signUp.verifications.sendEmailCode();
await signUp.verifications.verifyEmailCode({ code });
if (signUp.status === 'complete') {
  await signUp.finalize({ navigate: ... });
}
```

**Why:** @clerk/expo v3 shipped a breaking change to use React 19 signals/futures. The old `useSignIn()` returned `{ signIn, setActive, isLoaded }` but v3 returns `{ signIn: SignInFuture, errors, fetchStatus }`.

**How to apply:** Any time you write Clerk auth screens for Expo, always use this pattern. Reference: `.local/skills/clerk-auth/references/custom-ui/expo-sdk-email-password.md`
