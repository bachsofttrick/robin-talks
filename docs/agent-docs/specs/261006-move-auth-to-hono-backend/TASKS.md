# Tasks: Move auth into the Hono backend

Status: complete

## Wave 1
- [x] T1: Backend toolchain and dependencies (commit feb8a7f)
  - Satisfies: AC-2, AC-5
  - Files: apps/backend/package.json, apps/backend/tsconfig.json, apps/backend/tsconfig.build.json, .env.example, bun.lock
  - Do: declare `better-auth@1.6.23`, `drizzle-orm@0.45.3`, `pg@8.23.1` as dependencies and `drizzle-kit@0.31.11`, `@types/pg`, `@neondatabase/neon-js@0.7.0-beta`, `@neondatabase/auth@0.5.0-beta`, `bun-types@1.4.2` as devDependencies; remove the dead `jest`/`@types/jest`; set scripts `test: bun test`, `build: tsc -p tsconfig.build.json`, `db:generate: drizzle-kit generate`, `db:migrate: drizzle-kit migrate`, `db:verify: bun run db:migrate && bun run db:migrate && bun test src/db/migration.test.ts` (inert until T6); base tsconfig `types: ["node","bun-types"]` and `exclude: ["node_modules","dist","drizzle.config.ts"]` with `rootDir`/`outDir` removed; new `tsconfig.build.json` extending the base with `rootDir: ./src`, `outDir: ./dist`, `include: ["src"]`, `exclude: ["src/**/*.test.ts"]`; append `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST_UNPOOLED`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` to the existing `.env.example` block without reordering or re-adding the `EXPO_PUBLIC_*` or `PG*` keys; run `bun install`.
  - Tests: none (configuration only; the runner is proven by the tests committed in T2 through T9)
  - Done when: `bun install` succeeds, `bun run typecheck` and `bun run build` exit 0, and `package.json`'s `test` script is exactly `bun test` (do not run it; the suite is empty until T2).
- [x] T2: Environment module (commit 2364aca)
  - Satisfies: AC-4
  - Files: apps/backend/src/env.ts, apps/backend/src/env.test.ts
  - Do: read `process.env` only; export `databaseUrlOrNull()`, `unpooledDatabaseUrlOrNull()`, `requireDatabaseUrl()`, `authSecret()`, `baseUrl()`, `port()`, `trustedOrigins()`, `mailConfig()`. Compose `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}?sslmode=require`. `databaseUrlOrNull()` returns `DATABASE_URL` verbatim when set and only then falls back to the `PG*` composition. Unpooled prefers `DATABASE_URL_UNPOOLED`, then `PGHOST_UNPOOLED`, then `PGHOST` with `-pooler` stripped. `requireDatabaseUrl()` is the only DB thrower: it `console.error`s one line naming `DATABASE_URL` when nothing is configured, then exits non-zero; no test file may call it (T9 covers it via a subprocess). `baseUrl()` returns `BETTER_AUTH_URL ?? "http://localhost:3000"`; `port()` returns `Number(PORT ?? 3000)`; `trustedOrigins()` returns the comma-split `TRUSTED_ORIGINS` and falls back to `[baseUrl()]` when it is unset, so the evil-Origin test is not vacuous. `authSecret()` returns `BETTER_AUTH_SECRET` when set, a documented dev constant when `NODE_ENV !== "production"`, and throws otherwise. `mailConfig()` reads `MAIL_*` without throwing.
  - Tests: `src/env.test.ts` covers `DATABASE_URL` precedence and the `PG*` fallback, unpooled preference and `-pooler` stripping, the `sslmode=require` suffix, `baseUrl()`/`port()` defaults, `trustedOrigins()` splitting, the dev-vs-production secret, and `mailConfig()` not throwing.
  - Done when: `bun test src/env.test.ts` passes and `bun run typecheck` exits 0.
- [x] T3: Drizzle schema (commit 4d32982)
  - Satisfies: AC-3
  - Files: apps/backend/src/db/schema.ts, apps/backend/src/db/schema.test.ts
  - Do: define the `"user"`, `session`, `account`, and `verification` pgTables with better-auth 1.6.23's exact camelCase columns, the `email`/`token` uniques, the indexed `verification.identifier` and `session.userId`/`account.userId`, and the `onDelete: "cascade"` FKs to `"user"(id)`.
  - Tests: `src/db/schema.test.ts` asserts the four table names and their column names via `getTableColumns`, the uniques, and the cascade foreign keys.
  - Done when: `bun test src/db/schema.test.ts` passes and `bun run typecheck` exits 0.
- [x] T4: OTP transport (commit 26e96af)
  - Satisfies: AC-12
  - Files: apps/backend/src/mail/otp-transport.ts, apps/backend/src/mail/otp-transport.test.ts
  - Do: declare a plain `MailConfig = { provider?: string; apiKey?: string; from?: string }` in this module (no import from `../env`); `createOtpTransport(config)` selects the dev transport when `config.provider` is unset and a `fetch`-based provider transport when it is set; the dev transport logs and pushes `{ email, otp, type }` to an exported outbox; export `resetOutbox()`; the provider completeness (`provider` + `apiKey` + `from`) is checked inside `send`, so a half-configured provider throws only when `send` is called.
  - Tests: `src/mail/otp-transport.test.ts` covers selection with and without `provider`, outbox recording, the provider `fetch` call, and the lazy half-configuration error.
  - Done when: `bun test src/mail/otp-transport.test.ts` passes.

## Wave 2
- [x] T5: Database client and barrel (commit 55d0574)
  - Satisfies: AC-2, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11
  - Files: apps/backend/src/db/client.ts, apps/backend/src/db/index.ts, apps/backend/src/db/client.test.ts
  - Do: a lazy memoized `getDb()` returning `drizzle(new Pool({ connectionString: databaseUrlOrNull()! }), { schema })`, throwing only when a database is actually needed; when `databaseUrlOrNull()` is null it must still return the memoized instance without validating or connecting (so a DB-less run does not throw); a barrel that re-exports the client and schema as the single pool.
  - Tests: `src/db/client.test.ts` asserts `getDb() === getDb()` and that importing the module does not connect, with no database configured.
  - Done when: `bun test src/db/client.test.ts` passes and `bun run typecheck` exits 0.
- [x] T6: Drizzle config and migration (commit 0e900ce)
  - Satisfies: AC-3
  - Files: apps/backend/drizzle.config.ts, apps/backend/drizzle/0000_*.sql, apps/backend/drizzle/meta/*, apps/backend/src/db/migration.test.ts
  - Do: a self-contained `drizzle.config.ts` (no `env.ts` import) that calls `process.loadEnvFile()` in a try/catch when `PGUSER` is unset, then sets `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./drizzle"`, and `dbCredentials.url` derived from `DATABASE_URL_UNPOOLED`/`PGHOST_UNPOOLED`/`PGHOST` minus `-pooler` with `?sslmode=require`; run `bun run db:generate` and `bun run db:migrate` against the Neon database; commit the generated SQL and meta.
  - Tests: `src/db/migration.test.ts` queries `information_schema` for the four tables and skips with a reported reason when no database is configured; `bun run db:verify` runs `db:migrate` twice and then the test, proving the second run is a no-op.
  - Done when: `bun run db:verify` exits 0 against the Neon database.

## Wave 3
- [x] T7: Auth service core (commit d43a380)
  - Satisfies: AC-1, AC-6, AC-8, AC-12
  - Files: apps/backend/src/auth.ts, apps/backend/src/auth.e2e.test.ts
  - Do: the `betterAuth` instance with `database: (options) => drizzleAdapter(getDb(), { provider: "pg", schema })(options)`, `baseURL: baseUrl()`, `secret: authSecret()`, `trustedOrigins: trustedOrigins()`, `emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 }`, `emailVerification: { sendOnSignIn: true }`, `user: { deleteUser: { enabled: true } }`, `advanced: { useSecureCookies: baseUrl().startsWith("https"), disableOriginCheck: false }`, and `emailOTP({ otpLength: 6, overrideDefaultEmailVerification: true, sendVerificationOTP: (payload) => createOtpTransport(mailConfig()).send(payload) })`, creating the transport lazily inside `send`.
  - Tests: `src/auth.e2e.test.ts` drives `auth.handler(new Request(...))` against the Neon database with a per-run unique email and `afterAll` cleanup: sign-up returns no session and puts a 6-digit code in the outbox, verify-email then sign-in returns a cookie, get-session returns the user, sign-out clears it, and a later get-session returns `null` (AC-6, AC-8). Skips with a reported reason when no database is configured.
  - Done when: `bun test src/auth.e2e.test.ts` passes against the Neon database.

## Wave 4
- [x] T8: Auth flows extension (commit aaa4b45)
  - Satisfies: AC-7, AC-9, AC-10, AC-11
  - Files: apps/backend/src/auth.e2e.test.ts
  - Do: extend the existing suite; no production code changes unless a seam is missing.
  - Tests: add to `src/auth.e2e.test.ts`: signing in with an existing unverified account is refused with an email-not-verified error and adds a code, and `send-verification-otp` adds another (AC-7); `forget-password/email-otp` emits a reset code for a known address and returns 200 with no outbox entry for an unknown address, `email-otp/request-password-reset` also succeeds, `email-otp/reset-password` applies the new password, and sign-in with it succeeds (AC-9); change-password succeeds with the correct current password, is rejected with the wrong one, and a second session for the same user survives (AC-10); delete-user with the session from the immediately preceding sign-in (never an older one, to avoid `session.freshAge`) removes the user and leaves zero `session` and `account` rows (AC-11); duplicate sign-up returns 200 with `token: null` and no second row; a bad OTP is rejected; a 7-character password is rejected.
  - Done when: `bun test src/auth.e2e.test.ts` passes against the Neon database.

## Wave 5
- [x] T9: Hono app, entry, and conformance (commit 79eabe1)
  - Satisfies: AC-1, AC-4, AC-13
  - Files: apps/backend/src/app.ts, apps/backend/src/index.ts, apps/backend/src/app.test.ts, apps/backend/src/conformance.test.ts
  - Do: `createApp()` exporting a module-level `app` with `GET /health` -> `{ status: "ok" }`, `cors({ origin: trustedOrigins(), credentials: true })`, and `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`; `index.ts` default-exports `app` and, inside `if (import.meta.main)`, calls `requireDatabaseUrl()` then `Bun.serve({ port: port(), fetch: app.fetch })`.
  - Tests: `src/app.test.ts` asserts the `/health` and `/api/auth/ok` bodies, that each POST path in AC-13 returns a non-404 for an empty body (the GET-only `/api/auth/ok` is asserted separately), the evil-`Origin`-with-`Cookie` rejection, and the missing-database subprocess exit (spawned with `--no-env-file`, the database variables filtered out, and a `cwd` outside the repository). `src/conformance.test.ts` records `globalThis.fetch` while `createAuthClient(url, { adapter: SupabaseAuthAdapter() })` (importing `createAuthClient` from `@neondatabase/auth` and `SupabaseAuthAdapter` from `@neondatabase/auth/vanilla`) calls `signUp`, `signInWithPassword`, `signOut`, `getSession`, `verifyOtp`, and `signInWithOtp`, and asserts the recorded paths; it first asserts the stubbed response fails `isSessionResponseData`, so a cached/synthetic session cannot short-circuit `getSession`. Both tests are database-free.
  - Done when: `bun test src/app.test.ts src/conformance.test.ts` passes and `bun run dev` boots the server.

## Wave 6
- [x] T10: Quality gates (verified, no file changes)
  - Satisfies: AC-5, AC-14
  - Files: apps/backend/eslint.config.mjs (only if a rule needs relaxing)
  - Do: run the repo-wide gates from the root and fix what they surface in this feature's files.
  - Tests: none (gate task; it runs the suites committed in T2 through T9)
  - Done when: root `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build` each exit 0.

## Wave 7
- [x] T11: Backend app schema and session freshness (commit 479de46)
  - Satisfies: AC-1, AC-15, AC-16
  - Files: apps/backend/src/auth.ts, apps/backend/src/db/schema.ts, apps/backend/drizzle/0001_*.sql, apps/backend/drizzle/meta/*, apps/backend/src/db/migration.test.ts
  - Do: add `session: { freshAge: 0 }` to the better-auth config; add `learnerProfiles`, `practiceSessions`, `robinMemory`, and `profiles` pgTables with snake_case columns, `gen_random_uuid()::text` ids for the two generated-id tables, and `on delete cascade` FKs to `"user"(id)`; run `bun run db:generate` and `bun run db:migrate`; extend the migration test to assert the four new tables and their cascade FKs.
  - Tests: `src/db/migration.test.ts` asserts the four app tables and their cascade FKs exist, and that `practice_sessions.id` and `robin_memory.id` carry a `gen_random_uuid()` column default; skips with a reported reason without a database.
  - Done when: `bun run db:verify` exits 0 and `bun run typecheck` exits 0.
- [x] T13: Mobile backend data client (commit add00e9)
  - Satisfies: AC-18
  - Files: apps/mobile/src/lib/core/db/auth.ts, apps/mobile/src/lib/core/db/config.ts, apps/mobile/src/lib/core/db/data.ts, apps/mobile/src/lib/core/db/data.test.ts
  - Do: export `async sessionCookieHeader(): Promise<string>` that awaits `loadSessionCookies()` before reading the jar (and `await` it in `sessionPlugin.onRequest`); add `backendDataUrl()` that replaces a trailing `/api/auth` in `BACKEND_AUTH_URL` with `/api/data` and returns `""` when `BACKEND_AUTH_URL` is unset or does not end that way; add a typed data client (`getProfile`, `saveProfile`, `createSession`, `getOpenSession`, `getRecentSessions`, `getSession`, `updateSession`, `deleteAllSessions`, `listMemory`, `addMemory`, `deleteAllMemory`, `upsertProfile`) that sends the cookie header and returns `{ data, error }`.
  - Tests: `src/lib/core/db/data.test.ts` mocks `./auth` and `./config` (following `apps/mobile/src/lib/core/db/ai.test.ts:7-13`), stubs `fetch`, and asserts each method's exact URL (`/api/data/profile`, `/api/data/sessions`, `/api/data/sessions/open`, `/api/data/sessions/recent`, `/api/data/sessions/:id`, `/api/data/memory`, `/api/data/profiles`) plus the error mapping and the `backendDataUrl()` trailing-slash/unset cases.
  - Done when: mobile `lint`, `typecheck`, and `test` pass.

## Wave 8
- [x] T12: Backend data API (commit 7978454)
  - Satisfies: AC-17, AC-19
  - Files: apps/backend/src/data/router.ts, apps/backend/src/app.ts, apps/backend/src/data/router.test.ts
  - Do: add the `/api/data/*` router with a session middleware (`auth.api.getSession({ headers })`, 401 when null) and the CRUD handlers; mount it in `createApp()`. Register `/sessions/open` and `/sessions/recent` before `/sessions/:id`, and filter every id-addressed query by `user_id = session.user.id AND id = ?`. Every handler returns snake_case JSON keys via explicit drizzle projections (e.g. `select({ id, scenario_id: practiceSessions.scenarioId, ... })`); never hand drizzle's camelCase property keys to `c.json`.
  - Tests: `src/data/router.test.ts` drives `app.request` with a signed-in cookie: profile get/upsert, session create/open/recent/get/update/delete-all, memory list/insert/delete-all, profiles upsert, and the account-deletion cascade. Isolation: a second signed-in user gets 404 on `GET /sessions/:id`, a `PATCH /sessions/:id` leaves the owner's row unchanged and reports not found, and each user's `DELETE /sessions` / `DELETE /memory` leaves the other's rows intact. Rejection: a request with no cookie and one with a bogus cookie each return 401. Skips with a reported reason without a database.
  - Done when: `bun test src/data/router.test.ts` passes against the Neon database.
- [x] T14: Rewire mobile data hooks (commit eb47968)
  - Satisfies: AC-18
  - Files: apps/mobile/src/lib/api/useProfile.tsx, apps/mobile/src/lib/api/useSessions.tsx, apps/mobile/src/lib/api/useMemory.tsx, apps/mobile/src/lib/core/auth/actions.ts, apps/mobile/package.json
  - Do: branch on `IN_BROWSER` so native uses the data client while the browser keeps `db.from`, keeping each hook's public shape and plain error wording; `syncProfile` uses the data client on native. Import the client directly from `../core/db/data` (the Borel-managed `db.ts` barrel cannot re-export it). Add `@testing-library/react-native` as a dev dependency.
  - Tests: a hook test renders each hook under `AuthProvider` with `jest.mock("../core/db/data")` and `jest.mock("../core/auth")`, asserting the native branch calls the data client and returns the same shape; the existing mobile suite stays green.
  - Done when: mobile `lint`, `typecheck`, and `test` pass with the hook test included.

## Wave 9
- [x] T15: Quality gates after the update (verified, no file changes)
  - Satisfies: AC-20
  - Files: apps/backend/eslint.config.mjs (only if a rule needs relaxing), docs/agent-docs/, docs/agent-docs/specs/261006-move-auth-to-hono-backend/SPEC.md
  - Do: run the repo-wide gates and fix what they surface in the update's files; record the AC-15 through AC-20 results in SPEC.md's Verification section.
  - Tests: none (gate task; it runs the suites committed in T11 through T14)
  - Done when: root `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build` each exit 0, and SPEC.md's Verification section covers AC-15 through AC-20.

## Coverage
- AC-1: T7, T9, T11
- AC-2: T1, T5
- AC-3: T3, T6
- AC-4: T2, T9
- AC-5: T1, T10
- AC-6: T5, T7
- AC-7: T5, T8
- AC-8: T5, T7
- AC-9: T5, T8
- AC-10: T5, T8
- AC-11: T5, T8
- AC-12: T4, T7
- AC-13: T9
- AC-14: T10
- AC-15: 1112cc7 (mobile repoint, done), T11 (backend freshAge)
- AC-16: T11
- AC-17: T12
- AC-18: T13, T14
- AC-19: T12
- AC-20: T15
