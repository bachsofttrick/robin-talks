# Auth

Source paths are relative to `apps/mobile/` unless noted.

Accounts, sessions, and the account UI live in `src/lib/core/auth/`. The
top-level `src/lib/core/auth.tsx` is Borel-managed and re-exports the public
surface from the subfolder; implementation lives in `src/lib/core/auth/`.

The auth client is built against the better-auth implementation in
`apps/backend` (see [backend-and-ai.md](backend-and-ai.md)): `native()` in
`src/lib/core/db/auth.ts` uses `BACKEND_AUTH_URL`, which `config.ts` derives by
appending `/auth` to `EXPO_PUBLIC_BACKEND_URL` (an `/api` base), so `db.auth`
resolves to the backend client
without editing the Borel-managed `db.ts`. In the browser `db.auth` is
`brokerAuth`, a wrapper over the same backend URL (see below). The backend is
reached over HTTP, not imported.

## Connector surface (`src/lib/core/auth.tsx`)

Re-exports types (`User`, `Session`, `AuthResult`), constants
(`AUTH_REDIRECT_URL`, `PASSWORD_RESET_AVAILABLE`), `authErrorMessage`, the
context (`AuthProvider`, `useAuth`, and types), the actions (`signUp`, `signIn`,
`signOut`, `sendPasswordReset`, `resetPassword`, `confirmEmail`,
`updatePassword`, `resendConfirmation`, `deleteAccount`), and the UI
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
- `loading` is what the rest of the app gates on: `RootNavigator` holds its
  splash while it is true, so a launch with a stored session never flashes the
  signed-out screen. Settings waits on `memory.loading` and `sessions.loading`
  before showing the "Your data" counts, so those numbers never read as zero
  while the reads are in flight.

## Actions (`src/lib/core/auth/actions.ts`)

- `signUp(email, password, metadata?)`: three outcomes. A session means signed in
  immediately. No session means the account needs the emailed 6-digit code
  (`needsEmailConfirmation: true`). An error is shown as `error`.
- `signIn(email, password)`: maps "email not verified" to
  `needsEmailConfirmation` so the screen can offer a resend.
- `sendPasswordReset` / `resetPassword`: the OTP flow via `authCall` to
  `/email-otp/request-password-reset` and `/email-otp/reset-password`.
- `confirmEmail(email, code)`: `db.auth.verifyOtp({ type: "signup" })`.
- `updatePassword(password, currentPassword)`: requires the current password;
  reaches the underlying better-auth instance through
  `db.auth.getBetterAuthInstance()`.
- `resendConfirmation(email)`: `/email-otp/send-verification-otp`.
- `deleteAccount()`: calls `deleteUser()` on the better-auth instance behind the
  auth adapter (the backend `POST /api/auth/delete-user` route), then `signOut()`.
  Required by Apple Guideline 5.1.1(v).
- `syncProfile(user)`: upserts one row into `profiles` (id, email, display_name,
  avatar_url, updated_at). It calls `upsertProfile()` (`PUT
  /api/data/profiles`) on both surfaces.

Email/password errors are translated to plain sentences by
`authErrorMessage` (`src/lib/core/auth/errors.ts`), for example invalid
credentials, unconfirmed email, expired code, too many attempts, and network
failure.

## Session transport (`src/lib/core/db/auth.ts`)

- **Native:** the neon-js auth client is built against
  `BACKEND_AUTH_URL` (derived from `EXPO_PUBLIC_BACKEND_URL`, an `/api` base). A `sessionPlugin`
  writes every `Set-Cookie` to AsyncStorage under
  `backend-auth-session:<BACKEND_AUTH_URL>` and replays it as a `Cookie` header,
  with the platform cookie jar off. `sessionCookieHeader()` is exported and async:
  it awaits the cookie-jar load, then returns every unexpired cookie as one
  `name=value; ...` string. The data client (`src/lib/core/db/data.ts`) awaits it
  and sends it on every `/api/data/*` request, because better-auth accepts no
  bearer. `authHeader()` and the Borel Data API client remain, but they no longer
  carry the app's own tables; `authHeader()` is still used by the Borel storage,
  moderation, and notify modules.
- **Browser preview:** `brokerAuth` in `src/lib/core/db/browser-auth.ts` wraps a
  neon-js client built against `BACKEND_AUTH_URL` with no session
  plugin, so the browser's own cookie jar carries the backend session and
  requests use `credentials: "include"`. It keeps its own `onAuthStateChange`
  subscriber list and notifies it after sign-in, OTP verification, and sign-out
  by reading `getSession({ forceFetch: true })`. `getBetterAuthInstance()` passes
  through to the underlying client. The browser Data API client's `getToken`
  returns `"bps_anon"`.
- **Telling the screens (`tellScreens`):** the sign-in adapter reports the session
  once, when a screen subscribes, so a sign-in, a confirmed code, or a sign-out
  reached no mounted screen. `announceSessionChanges()` runs at import and wraps
  `signInWithPassword`, `signUp`, `verifyOtp`, and `signOut` so each calls
  `tellScreens()` afterwards, and wraps `onAuthStateChange` so subscribers are
  held in `phoneSubscribers`. `tellScreens` calls `forgetModeration()` (imported
  from `moderation-state`, so the two modules do not import each other), forces a
  fresh `getSession({ forceFetch: true })`, then notifies every subscriber with
  `SIGNED_IN` or `SIGNED_OUT`. It returns early in the browser, where
  `brokerAuth` announces its own listeners.

## Account UI

- `RequireAccount` (`RequireAccount.tsx`) renders `null` while loading, the
  children when signed in, and otherwise a centred card holding the Robin `Bird`
  mark, the `signInPrompt` label with the optional `reason` appended, and a button
  that opens `SignInSheet`. Practice passes "to practise with Robin" and Settings
  "to manage your practice". It reads `useKitSession()`, so it works with or
  without `AuthProvider` above it.
- `SignInFlow` (`SignInFlow.tsx`) is one component with steps `signIn`, `signUp`,
  `confirm`, `forgot`, `reset`. It shows the Terms and Privacy links on the
  sign-up step.
- `SignInSheet` wraps `SignInFlow` in a modal. `AccountPanel`
  (`AccountPanel.tsx`) shows the signed-in email with change-password, sign-out,
  and a two-step delete-account flow.
- Labels are centralised in `src/lib/core/auth/labels.ts` (`AccountKitLabels`,
  `LABELS`, `labelsWith`). Auth UI uses its own `KIT` colour constants
  (`src/lib/core/auth/constants.ts`) rather than the app theme.

Tests for the pure helpers are `errors.test.ts` and `labels.test.ts`.
