# Spec: Move auth into the Hono backend

Status: verified
Request: Move auth of this app into our hono backend, reducing dependency on borel.one. Use drizzle, better-auth. Consult context7 on how to proceed. You have permission to use this Neon database: PGHOST=ep-super-forest-arzkb9q6-pooler.c-4.us-west-2.aws.neon.tech, PGHOST_UNPOOLED=ep-super-forest-arzkb9q6.c-4.us-west-2.aws.neon.tech, PGUSER=neondb_owner, PGDATABASE=neondb, PGPASSWORD=<redacted>. Create a spec, a plan. With each, have an `adversaral-agent` review it, come to an agreement then proceed to the next step. No human acceptance required for any step forward.

## Overview
Robin Talks is client-only today: accounts, sessions, OTP codes, and password reset
all go through the Borel cloud proxy at `api.borel.one`, which fronts a better-auth
service. This feature stands up that same auth surface inside our own Hono backend
(`apps/backend`) using better-auth with a drizzle adapter over the provided Neon
Postgres database, so account data and auth logic live in infrastructure we control.
Borel's auth server is already better-auth, so the backend serves the same endpoints
the mobile client calls; a conformance test proves that without a device. Repointing
the mobile app's `EXPO_PUBLIC_AUTH_URL` is a documented follow-up, not part of this
feature, because the session token is also consumed by the Data API and the sibling
Borel surfaces (see Q-1). Data, storage, AI, moderation, notifications, and account
deletion stay on Borel.

## User Stories
- As a Robin Talks developer, I want accounts, sessions, OTP codes, and password reset served by our own Hono backend, so auth logic and account data stop depending on the Borel proxy.
- As a learner, I want the backend to offer sign-up, email verification with a 6-digit code, sign-in and sign-out, password reset, password change, and account deletion, so the app can keep the same experience when it moves.
- As a developer, I want the auth tables created by a committed drizzle schema and migration, so the database is reproducible from the repository.
- As an operator, I want the OTP email transport to be configurable by environment, so development captures codes in-process and production sends real email without a code change.

## Acceptance Criteria
- AC-1 (server and config): `apps/backend` starts a Hono server that mounts better-auth at `/api/auth/*`; `GET /health` returns 200 `{ "status": "ok" }` and `GET /api/auth/ok` returns `{ "ok": true }`. The entry point listens when run directly and default-exports the `app` for in-process `app.request` tests. The better-auth instance pins: `baseURL` from `BETTER_AUTH_URL` (default `http://localhost:3000`), `secret` from `BETTER_AUTH_SECRET`, `trustedOrigins` from `TRUSTED_ORIGINS` (comma-separated), email+password enabled with `requireEmailVerification: true` and `minPasswordLength: 8`, `emailVerification: { sendOnSignIn: true }`, `user: { deleteUser: { enabled: true } }`, the emailOTP plugin with `otpLength: 6` and `overrideDefaultEmailVerification: true`, and `advanced.useSecureCookies: false` when `baseURL` is `http`.
- AC-2 (dependencies declared): `apps/backend/package.json` declares `better-auth` pinned to `1.6.23` (the schema in AC-3 matches that version), `drizzle-orm`, `pg`, and dev `drizzle-kit`, `@types/pg`, `@neondatabase/neon-js`, and `@neondatabase/auth` (the last two for the conformance test), and the root `bun.lock` is updated; none of these remain hoisted-transitive-only.
- AC-3 (schema and migration): a committed drizzle schema defines better-auth's tables `user`, `session`, `account`, and `verification` with better-auth 1.6.23's exact table and column names, quoting the reserved `"user"` table. A committed SQL migration applies cleanly to the empty Neon database via `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED` (or `PGHOST_UNPOOLED`); a second `migrate` run exits 0 with no pending migrations; the four tables are present afterward.
- AC-4 (database env contract): the backend resolves the runtime database URL from `DATABASE_URL`, and falls back to composing it from `PGHOST`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`; migrations use `DATABASE_URL_UNPOOLED` (or `PGHOST_UNPOOLED`). `.env.example` documents `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `MAIL_PROVIDER`, `MAIL_API_KEY`, and `MAIL_FROM`. When no database configuration is present, starting the server exits non-zero with a single-line error naming the missing variable.
- AC-5 (backend test infrastructure): the backend test script runs `bun test` and exits 0 with at least the tests below committed; test files use `bun:test`, a dev dependency provides its types, `tsconfig.json` includes those types for `typecheck`, and the build excludes `**/*.test.ts` from `dist`.
- AC-6 (sign-up and email verification): against the configured database with a per-run unique email, an in-process `app.request` call to `POST /api/auth/sign-up/email` creates a user; because verification is required, the response carries no session; the OTP transport's outbox holds a 6-digit code for that address; `POST /api/auth/email-otp/verify-email` with that code marks the email verified; a following `POST /api/auth/sign-in/email` returns a session cookie. The test cleans up the user afterward.
- AC-7 (unverified sign-in and resend): against the configured database, signing in with an existing but unverified account is refused with an email-not-verified error and produces a fresh code (`sendOnSignIn`); `POST /api/auth/email-otp/send-verification-otp` with `{ email, type: "email-verification" }` for that account produces another code (the outbox gains an entry; `resendStrategy` is unset, so a new code is generated each call).
- AC-8 (session lifecycle): against the configured database, with the session cookie from sign-in, `GET /api/auth/get-session` returns the signed-in user; `POST /api/auth/sign-out` clears the cookie; a later `GET /api/auth/get-session` returns `null`.
- AC-9 (password reset): against the configured database, `POST /api/auth/forget-password/email-otp` produces a reset code for a known address and returns success without revealing whether the address exists; `POST /api/auth/email-otp/reset-password` with that code and a new password changes it; signing in with the new password succeeds. The deprecated alias is kept for mobile parity; `/api/auth/email-otp/request-password-reset` is the forward path. The mobile `PASSWORD_RESET_AVAILABLE` constant is unchanged by this feature.
- AC-10 (password change): against the configured database, with a valid session, `POST /api/auth/change-password` changes the password when the current password is correct and rejects it when it is wrong; other sessions are retained (`revokeOtherSessions: false`).
- AC-11 (account deletion): against the configured database, an authenticated `POST /api/auth/delete-user` removes the user and leaves no `session` or `account` rows for that user. The request carries a session minted by the immediately preceding sign-in, or supplies the account password, so the test does not depend on `session.freshAge`, which defaults to 24 hours.
- AC-12 (OTP transport): the transport is a module exporting an injectable `send` and an inspectable outbox of `{ email, otp, type }`. `createOtpTransport(env)` returns the development transport when `MAIL_PROVIDER` is unset and the configured transport when `MAIL_PROVIDER`, `MAIL_API_KEY`, and `MAIL_FROM` are set. A unit test proves the selection and that the `otp` produced for each `type` is handed to the transport.
- AC-13 (client conformance): the backend serves, at the exact paths the mobile client issues whether through `db.auth` (the neon-js `SupabaseAuthAdapter`) or through `authCall`'s raw `fetch`, the request/response shapes it expects: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `POST /api/auth/email-otp/verify-email`, `POST /api/auth/email-otp/send-verification-otp`, `POST /api/auth/forget-password/email-otp`, `POST /api/auth/email-otp/reset-password`, and `POST /api/auth/change-password`. A test asserts each path is routed (not 404). A recording test constructs the adapter with `createAuthClient(url, { adapter: SupabaseAuthAdapter() })`, importing `createAuthClient` from `@neondatabase/auth` and `SupabaseAuthAdapter` from `@neondatabase/auth/vanilla`, and stubs `globalThis.fetch` with a response that carries no session, so the adapter's session cache stays empty and every method, including `getSession`, issues its request; the adapter's `customFetchImpl` ignores an injected `fetch` and calls `globalThis.fetch`. The test asserts `signUp`, `signInWithPassword`, `signOut`, `getSession`, `verifyOtp`, and `signInWithOtp` hit those paths. No device is required.
- AC-14 (quality gates): backend `lint`, `typecheck`, `test`, and `build` pass; mobile `lint`, `typecheck`, and `test` pass (the mobile suite is a regression check, unchanged). The database-backed tests for AC-6 through AC-11 are skipped with a reported reason when neither `DATABASE_URL` nor the `PG*` variables are set, so `bun run test` stays green in a database-less environment.

## Edge Cases
- Duplicate sign-up: with `requireEmailVerification: true`, better-auth returns HTTP 200 with `token: null` and a synthetic user rather than an already-exists error, so the neon-js adapter surfaces `SessionNotFound`; `authErrorMessage`'s already-exists branch applies only when verification is not required. The test asserts the 200 generic response and that no second row is created.
- Wrong or expired verification code: `/api/auth/email-otp/verify-email` fails with an invalid-OTP error.
- Password reset requested for an unknown address: the endpoint succeeds and no code is delivered, so accounts cannot be enumerated.
- Password shorter than 8 characters: sign-up and reset fail with a password-too-short error.
- `DATABASE_URL` and all `PG*` variables absent: starting the server is a subprocess test asserting a non-zero exit and a one-line message naming the missing variable; the subprocess runs with a working directory outside the repository so Bun does not auto-load the root `.env`.
- A request with `Origin: https://evil.example`: rejected by `trustedOrigins`/CORS, asserted with an explicit `Origin` header via `app.request` (React Native sends no `Origin`, so the device path is not the test).
- Re-running `drizzle-kit migrate` on an already-migrated database: exits 0 with no pending migrations.
- Re-running the database-backed tests: each run uses a unique email and removes the user in `afterAll`, so no state carries over.
- Web preview is out of scope: `IN_BROWSER` still selects Borel's `brokerAuth`; the browser and native remain separate stores until the repoint follow-up.

## Non-Goals
- Repointing the mobile app's `EXPO_PUBLIC_AUTH_URL` to the backend. The same session token also authorizes the Data API (`db.from`), `db.storage`, `db.ai`, `db.moderation`, `db.notify`, and `db.account` (and the `syncProfile` upsert) against Borel, so a switch would break them all at once; the repoint is a follow-up that must move or bridge those surfaces.
- Migrating the Data API, storage, AI images, moderation, notifications, or account deletion off Borel.
- Migrating existing Borel accounts, sessions, or rows into the new database.
- Social or OAuth sign-in (Apple was removed in commit `3fd77d1`).
- Deploying the backend to a public host or provisioning DNS/TLS.
- A specific production email vendor: only the env-selectable transport seam is in scope.
- Flipping `PASSWORD_RESET_AVAILABLE`, which stays `false`.

## Open Questions
- Q-1: The Data API, storage, AI, moderation, notifications, and account deletion all consume the session token as a bearer, so a session minted by our backend will not authorize them. Resolved for this feature: do not repoint the mobile app; build the backend auth service and prove endpoint conformance with the client instead. A later feature must move or bridge those surfaces before the repoint. (blocks: nothing in this feature)

## Verification
- AC-1: pass (`bun run dev` in `apps/backend`; `curl -s localhost:3000/health` -> `{"status":"ok"}` 200, `curl -s localhost:3000/api/auth/ok` -> `{"ok":true}` 200; `index.ts` default-exports `app` and calls `Bun.serve` under `import.meta.main`)
- AC-2: pass (`apps/backend/package.json` declares `better-auth@1.6.23`, `drizzle-orm@0.45.3`, `pg@8.23.1`, dev `drizzle-kit@0.31.11`, `@types/pg`, `@neondatabase/neon-js@0.7.0-beta`, `@neondatabase/auth@0.5.0-beta`; `bun.lock` records the same)
- AC-3: pass (`bun run db:verify` -> two `drizzle-kit migrate` runs `[✓] migrations applied successfully!` and `migration.test.ts` `3 pass 0 fail`; `drizzle/0000_lean_george_stacy.sql` creates quoted `"user"`, `session`, `account`, `verification`)
- AC-4: pass (`bun test src/env.test.ts` 19 pass; `bun --no-env-file src/index.ts` with DB vars filtered and cwd `/tmp` -> `Missing required environment variable: DATABASE_URL`, exit 1; `.env.example` documents all nine variables)
- AC-5: pass (`"test": "bun test"`, all tests import `bun:test`, `tsconfig.json` `types: ["node","bun-types"]`, `tsconfig.build.json` excludes `src/**/*.test.ts`; `dist` contains 0 `*.test.js`)
- AC-6: pass (`bun test src/auth.e2e.test.ts` -> `(pass) AC-6: sign-up creates a user, OTP verifies the email, sign-in returns a session`)
- AC-7: pass (same run -> `(pass) AC-7: unverified sign-in is refused and re-sends a fresh email-verification OTP`)
- AC-8: pass (same run -> `(pass) AC-8: get-session returns the user, sign-out clears the session`)
- AC-9: pass (same run -> `(pass) AC-9: forget-password issues a reset code, reset-password changes it, and unknown emails do not enumerate`)
- AC-10: pass (same run -> `(pass) AC-10: change-password rejects a wrong current password and retains other sessions`)
- AC-11: pass (same run -> `(pass) AC-11: delete-user removes the user and all session and account rows`; e2e `9 pass 0 fail`)
- AC-12: pass (`bun test src/mail/otp-transport.test.ts` -> `6 pass 0 fail`)
- AC-13: pass (`bun test src/app.test.ts src/conformance.test.ts` -> app `14 pass 0 fail` including 10 non-404 route assertions and the evil-origin 403, conformance `1 pass 0 fail` recording the adapter paths)
- AC-14: pass (root `bun run lint`, `bun run typecheck`, `bun run test` with backend `64 pass 0 fail`, then `bun run build` all exit 0; no-DB run -> `0 pass, 9 skip, 0 fail`)
