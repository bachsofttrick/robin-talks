# Auth

Accounts, sessions, and the account UI live in `src/lib/core/auth/`. The
top-level `src/lib/core/auth.tsx` is Borel-managed and re-exports the public
surface from the subfolder; implementation lives in `src/lib/core/auth/`.

## Connector surface (`src/lib/core/auth.tsx`)

Re-exports types (`User`, `Session`, `AuthResult`), constants
(`AUTH_REDIRECT_URL`, `APPLE_IN_PREVIEW`, `APPLE_SIGN_IN_AVAILABLE`,
`PASSWORD_RESET_AVAILABLE`), `authErrorMessage`, the context (`AuthProvider`,
`useAuth`, and types), the actions (`signUp`, `signIn`, `signOut`,
`sendPasswordReset`, `resetPassword`, `confirmEmail`, `updatePassword`,
`resendConfirmation`, `deleteAccount`, `signInWithApple`), and the UI
(`SignInFlow`, `SignInSheet`, `RequireAccount`, `AccountPanel`).

## Provider and hooks (`src/lib/core/auth/context.tsx`)

- `AuthProvider` reads the stored session with `db.auth.getSession()`, subscribes
  to `db.auth.onAuthStateChange`, and exposes `{ loading, session, user,
  signedIn }` plus every action. A session that cannot be read resolves to signed
  out rather than stuck.
- On every user change it calls `syncProfile(user)` (best-effort, once per user
  per launch).
- `useAuth()` throws outside the provider. `useKitSession()` is the providerless
  variant: it reads the context when present, otherwise subscribes on its own, so
  account UI also works in apps that never mount `AuthProvider`.

## Actions (`src/lib/core/auth/actions.ts`)

- `signUp(email, password, metadata?)`: three outcomes. A session means signed in
  immediately. No session means the account needs the emailed 6-digit code
  (`needsEmailConfirmation: true`). An error is shown as `error`.
- `signIn(email, password)`: maps "email not verified" to
  `needsEmailConfirmation` so the screen can offer a resend.
- `sendPasswordReset` / `resetPassword`: the OTP flow via `authCall` to
  `/forget-password/email-otp` and `/email-otp/reset-password`.
- `confirmEmail(email, code)`: `db.auth.verifyOtp({ type: "signup" })`.
- `updatePassword(password, currentPassword)`: requires the current password;
  only available on native (the preview has no password change).
- `resendConfirmation(email)`: `/email-otp/send-verification-otp`.
- `deleteAccount()`: `db.account.delete()` then `signOut()`. Required by Apple
  Guideline 5.1.1(v).
- `signInWithApple()`: fetches a nonce from the Borel Apple proxy
  (`appleCall("/nonce")`), opens Apple's sheet via `signInWithApple` from
  `borel-systemui.js`, then posts the identity token to `/sign-in` and adopts the
  returned session cookie. Unavailable in the browser preview.
- `syncProfile(user)`: upserts one row into `profiles` (id, email, display_name,
  avatar_url, updated_at).

Email/password errors are translated to plain sentences by
`authErrorMessage` (`src/lib/core/auth/errors.ts`), for example invalid
credentials, unconfirmed email, expired code, too many attempts, and network
failure.

## Session transport (`src/lib/core/db/auth.ts`)

- **Native:** the neon-js client keeps the sign-in session as a cookie. A
  `sessionPlugin` writes every `Set-Cookie` to AsyncStorage under
  `borel-auth-session:<AUTH_URL>` and replays it as a `Cookie` header, with the
  platform cookie jar off. Data calls use the short-lived token from
  `authHeader()`.
- **Browser preview:** `brokerAuth` mimics the Supabase auth surface, but the
  opaque handle is held by the parent preview frame and passed by
  `postMessage`/AsyncStorage; the browser never holds a real JWT. `getToken` in
  the Data API client returns the handle or `"bps_anon"`.
- `adoptSession(setCookie)` is used by Sign in with Apple to keep Borel's session
  like a normal one.

## Account UI

- `RequireAccount` (`RequireAccount.tsx`) renders `null` while loading, the
  children when signed in, and otherwise a short sign-in card with a button that
  opens `SignInSheet`. Used by Practice and Settings.
- `SignInFlow` (`SignInFlow.tsx`) is one component with steps `signIn`, `signUp`,
  `confirm`, `forgot`, `reset`. It shows the Terms and Privacy links on the
  sign-up step, and the `Continue with Apple` button when
  `APPLE_SIGN_IN_AVAILABLE` is true and the platform is iOS or the preview.
- `SignInSheet` wraps `SignInFlow` in a modal. `AccountPanel`
  (`AccountPanel.tsx`) shows the signed-in email with change-password, sign-out,
  and a two-step delete-account flow.
- Labels are centralised in `src/lib/core/auth/labels.ts` (`AccountKitLabels`,
  `LABELS`, `labelsWith`). Auth UI uses its own `KIT` colour constants
  (`src/lib/core/auth/constants.ts`) rather than the app theme.
- `APPLE_SIGN_IN_AVAILABLE` reads `EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE` with
  static dot access, since Expo inlines only that form.

Tests for the pure helpers are `errors.test.ts` and `labels.test.ts`.
