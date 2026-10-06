# Plan: Move auth into the Hono backend

Status: approved
Spec: SPEC.md

## Approach
Stand up a self-contained better-auth service inside `apps/backend`, backed by a
drizzle schema over the provided Neon Postgres database and mounted on Hono at
`/api/auth/*`. better-auth 1.6.23 is configured to match what the mobile client
already expects from Borel (email+password with required email verification, the
emailOTP plugin for verification and password reset, change-password, delete-user),
with a small env module and an injectable OTP transport so the whole surface can be
driven in-process by `bun test`. The mobile app is not repointed in this feature
(the same session token also authorizes six Borel surfaces); instead a conformance
test proves the backend serves the exact paths the mobile client issues. Drizzle
generates and applies one committed migration to the empty Neon database.

## Affected Code
- `apps/backend/src/index.ts`: entry point; inside `if (import.meta.main)` calls `requireDatabaseUrl()`, then `Bun.serve` with `port: port()`, and default-exports `app` (the `requireDatabaseUrl()` call stays inside the guard so importing `index.ts` in a test never throws) (AC-1, AC-4).
- `apps/backend/src/app.ts` (new): exports `createApp()` and a module-level `const app = createApp()`; Hono with `GET /health` -> `{ status: "ok" }`, `cors({ origin: trustedOrigins, credentials: true })`, and `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))` (AC-1, AC-13).
- `apps/backend/src/env.ts` (new): reads `process.env` only (never `Bun.env`); exports `databaseUrlOrNull()`, `unpooledDatabaseUrlOrNull()`, `requireDatabaseUrl()`, `authSecret()`, `baseUrl()`, `port()`, `trustedOrigins()`, `mailConfig()`. Composes `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}?sslmode=require`; unpooled prefers `DATABASE_URL_UNPOOLED`, then `PGHOST_UNPOOLED`, then `PGHOST` with `-pooler` stripped. `requireDatabaseUrl()` is the only DB thrower and exits non-zero with a one-line `console.error` naming the missing variable. `baseUrl()` returns `BETTER_AUTH_URL ?? "http://localhost:3000"`; `port()` returns `Number(PORT ?? 3000)`. `authSecret()` returns `BETTER_AUTH_SECRET` when set, a documented dev-only constant when `NODE_ENV !== "production"`, and throws otherwise (at `auth.ts` module scope) (AC-4).
- `apps/backend/src/db/client.ts` (new): lazy memoized `getDb()` returning `drizzle(new Pool({ connectionString: databaseUrlOrNull()! }), { schema })`; no throw at import so DB-less test files still load (AC-2, AC-6..AC-11).
- `apps/backend/src/db/schema.ts` (new): drizzle tables `user` (quoted `"user"`), `session`, `account`, `verification` with better-auth 1.6.23's exact camelCase column names and the cascade FKs (AC-3).
- `apps/backend/src/db/index.ts` (new): barrel re-exporting the client and schema (single pool; no second instance).
- `apps/backend/src/auth.ts` (new): `betterAuth` with `database: (options) => drizzleAdapter(getDb(), { provider: "pg", schema })(options)`, `baseURL: baseUrl()`, `secret: authSecret()`, `trustedOrigins: trustedOrigins()`, `emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 }`, `emailVerification: { sendOnSignIn: true }`, `user: { deleteUser: { enabled: true } }`, `advanced: { useSecureCookies: baseUrl().startsWith("https"), disableOriginCheck: false }`, and `emailOTP({ otpLength: 6, overrideDefaultEmailVerification: true, sendVerificationOTP: (payload) => transport.send(payload) })`. The transport is created lazily inside `send` so a half-configured `MAIL_PROVIDER` fails only when the provider path is taken (AC-1, AC-6..AC-12).
- `apps/backend/src/mail/otp-transport.ts` (new): `createOtpTransport(config)` takes a plain `MailConfig = { provider?, apiKey?, from? }` declared in the module (no `env.ts` import); it selects the dev transport when `config.provider` is unset, and the `fetch`-based provider transport when it is; the provider completeness is checked inside `send`. Exports the module-level outbox and `resetOutbox()` for tests (AC-12).
- `apps/backend/drizzle.config.ts` (new): self-contained on `process.env` (does not import `env.ts`, so `db:generate` works without a database; the derivation is duplicated by design); `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./drizzle"`, and `dbCredentials: { url }` where `url` is `DATABASE_URL_UNPOOLED`, else `PGHOST_UNPOOLED`, else `PGHOST` with `-pooler` stripped, each composed as `postgresql://${PGUSER}:${PGPASSWORD}@${host}:5432/${PGDATABASE}?sslmode=require`; no `?? ""` fallback so drizzle-kit's own `DATABASE_URL` fallback is not shadowed (AC-3).
- `apps/backend/drizzle/0000_*.sql` and `drizzle/meta/*` (new, committed): the generated migration (AC-3).
- `apps/backend/package.json`: declare `better-auth@1.6.23`, `drizzle-orm@0.45.3`, `pg`; dev `drizzle-kit@0.31.11`, `@types/pg`, `@neondatabase/neon-js`, `@neondatabase/auth`, `bun-types`; scripts `test: bun test`, `build: tsc -p tsconfig.build.json`, `db:generate`, `db:migrate`, `db:verify` (runs `db:migrate` twice and asserts the four tables via `information_schema`); drop the dead `jest`/`@types/jest` (AC-2, AC-3, AC-5, AC-14).
- `apps/backend/tsconfig.json`: remove `rootDir`/`outDir`, `"types": ["node", "bun-types"]`, `"exclude": ["node_modules", "dist", "drizzle.config.ts"]` (AC-5).
- `apps/backend/tsconfig.build.json` (new): extends the base, restores `rootDir: ./src`/`outDir: ./dist`, `include: ["src"]`, `exclude: ["src/**/*.test.ts"]` (AC-5).
- `.env.example`: document `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` (AC-4).
- Tests (new): `src/app.test.ts` (health and `/api/auth/ok` bodies; each AC-13 path is routed, not 404); `src/mail/otp-transport.test.ts` (selection and outbox); `src/auth.e2e.test.ts` (AC-6..AC-11 plus duplicate sign-up returning 200 `token: null` with no second row, an invalid OTP, and a 7-character password rejection); `src/conformance.test.ts` (the `globalThis.fetch` recording test); `src/env.test.ts` (the missing-config subprocess and the origin rejection) (AC-5..AC-14).
- `src/app.test.ts`'s routing check is database-free: it POSTs an empty/invalid body to each POST path and asserts the status is not 404 (skipping the GET-only `/api/auth/ok`, which is asserted separately), so validation rejects before any row is written; the recording half of AC-13 is likewise database-free because `SupabaseAuthAdapter` calls `globalThis.fetch` directly.
- `src/db/migration.test.ts` (new): a database-backed test asserting the four better-auth tables exist in `information_schema`; `db:verify` covers the second-`migrate` no-op (AC-3).

## Data Model and Contracts
Drizzle tables (exact better-auth 1.6.23 names; camelCase columns; the adapter's
`camelCase` flag is declared in its types but never read at runtime, so it is
intentionally omitted and the columns are declared camelCase to match better-auth's
`fieldName` defaults):

```
"user"        id text pk, name text not null, email text not null unique,
              emailVerified boolean not null default false, image text,
              createdAt timestamp not null default now(), updatedAt timestamp not null
session       id text pk, expiresAt timestamp not null, token text not null unique,
              createdAt timestamp not null, updatedAt timestamp not null,
              ipAddress text, userAgent text,
              userId text not null references "user"(id) on delete cascade (indexed)
account       id text pk, accountId text not null, providerId text not null,
              userId text not null references "user"(id) on delete cascade (indexed),
              accessToken, refreshToken, idToken, accessTokenExpiresAt,
              refreshTokenExpiresAt, scope, password (nullable), createdAt, updatedAt
verification  id text pk, identifier text not null (indexed), value text not null,
              expiresAt timestamp not null, createdAt, updatedAt
```

HTTP contract (mounted under `BETTER_AUTH_URL`):
- `GET /health` -> `{ "status": "ok" }`
- `GET /api/auth/ok` -> `{ "ok": true }`
- `POST /api/auth/sign-up/email` `{ email, password, name }` -> `{ token, user }` (null token when verification is required)
- `POST /api/auth/sign-in/email` `{ email, password }` -> session cookie + `{ user }`
- `POST /api/auth/sign-out`, `GET /api/auth/get-session`
- `POST /api/auth/email-otp/verify-email` `{ email, otp }`
- `POST /api/auth/email-otp/send-verification-otp` `{ email, type }`
- `POST /api/auth/forget-password/email-otp` `{ email }`
- `POST /api/auth/email-otp/request-password-reset` `{ email }` (forward path)
- `POST /api/auth/email-otp/reset-password` `{ email, otp, password }`
- `POST /api/auth/change-password` `{ newPassword, currentPassword, revokeOtherSessions? }`
- `POST /api/auth/delete-user` (session or `{ password }`) — backend parity only; the mobile `deleteAccount` still calls Borel's account surface (spec Non-Goals).

Transport contract: `send({ email, otp, type })`; outbox entries are
`{ email, otp, type }` where `type` is `"sign-in" | "email-verification" |
"forget-password" | "change-email"`.

Test cookie handling: `app.request` keeps no cookie jar, so sign-in's `set-cookie`
is captured and re-sent as a `Cookie` header for AC-8, AC-10, and AC-11.

## Libraries
- `better-auth@1.6.23`: auth server; email/password, emailOTP plugin, drizzle adapter, delete-user, change-password (pinned to match the committed schema and the mobile client).
- `drizzle-orm@0.45.3` + `drizzle-kit@0.31.11` (dev): schema and migrations over Postgres; the versions match better-auth's drizzle-adapter peer range.
- `pg@8.23.1`: node-postgres `Pool` driver for drizzle and better-auth.
- `hono@^4.13.13`: HTTP server and `hono/cors` middleware (already present).
- `@neondatabase/auth@0.5.0-beta`, `@neondatabase/neon-js@0.7.0-beta` (dev): build the `SupabaseAuthAdapter` in the conformance test.
- `bun-types@1.4.2` (dev): type `bun:test` imports for `typecheck`.

## Risks
- Neon's pooled host breaks prepared-statement DDL: migrations run against `DATABASE_URL_UNPOOLED`/`PGHOST_UNPOOLED`/`PGHOST` minus `-pooler`; runtime uses the pooled URL. Composed URLs carry `?sslmode=require`; the libpq deprecation warning on stderr is expected.
- The gitignored root `.env` lacks `BETTER_AUTH_SECRET`: `authSecret()` uses `BETTER_AUTH_SECRET` when set and a documented dev-only constant otherwise (required in production), so local dev and tests start without editing `.env`.
- Database-backed tests mutate the real Neon DB: every run uses a unique email and deletes the user in `afterAll`; when no DB is configured the AC-6..AC-11 tests skip with a reported reason so `bun run test` stays green.
- A DB-less environment must still load every test file: `env.ts` never throws at import; only `requireDatabaseUrl()` in `index.ts` throws, and `getDb()` is lazy.
- The missing-config subprocess test inherits the parent `process.env`, so it spawns with the `DATABASE_URL`/`PG*` keys filtered out and an absolute `cwd` outside the repository.
- Bun sets `NODE_ENV=test`, and better-auth skips origin checks in tests: `advanced.disableOriginCheck: false` is pinned, and the origin test sends both `Origin: https://evil.example` and a `Cookie` header (the origin check runs only when cookies are present).
- `drizzle.config.ts` must not import `env.ts`: drizzle-kit loads it in a Node process where a throwing env module or `Bun.env` would break `db:generate`.
- `drizzle-kit generate` and `tsc` disagree about `drizzle.config.ts` living outside `rootDir`: the base tsconfig excludes it and the build uses `tsconfig.build.json` scoped to `src`.
- better-auth table names drift across versions: pin `better-auth@1.6.23`; the sign-up/session tests fail loudly if the drizzle schema does not match.
- `"user"` is a reserved word: the drizzle table is declared with the quoted name and the generated SQL quotes it.
- A real mail provider is not exercised: only the selection and the hand-off of `otp` to the transport are unit-tested; the provider transport is a thin `fetch` call behind the same seam.
- The mobile app is not repointed: the Data API and five sibling Borel surfaces still need the Borel session; this is stated in the spec's Non-Goals and Q-1 and is a follow-up, not a silent divergence.

## Update: mobile repoint and data migration (AC-15 through AC-20)

Status: approved
Spec: SPEC.md

### Approach
Repoint the native mobile auth client at the backend (already implemented and
committed in `1112cc7`), then move the app's own data tables off Borel. Add
`learner_profiles`, `practice_sessions`, `robin_memory`, and `profiles` to the
drizzle schema with `on delete cascade` FKs to `"user"(id)`, and serve them from a
new authenticated `/api/data/*` router in the Hono backend that resolves the caller
from the better-auth session cookie. On the phone, add a small data client that
replays the persisted session cookie and rewires `useProfile`, `useSessions`,
`useMemory`, and `syncProfile`; the browser preview kept `db.from` (superseded by the browser update below, which uses the backend client on both surfaces).

### Affected Code
- `apps/backend/src/auth.ts`: add `session: { freshAge: 0 }` (AC-1, AC-15).
- `apps/backend/src/db/schema.ts`: add `learnerProfiles`, `practiceSessions`, `robinMemory`, `profiles` pgTables with snake_case columns and cascade FKs (AC-16).
- `apps/backend/drizzle/0001_*.sql` + `meta/*`: generated migration (AC-16).
- `apps/backend/src/data/router.ts` (new): the `/api/data/*` Hono router with the session middleware and the CRUD handlers (AC-17).
- `apps/backend/src/app.ts`: mount the data router at `/api/data/*` (AC-17).
- `apps/backend/src/data/router.test.ts` (new): the DB-backed e2e data tests (AC-17, AC-19).
- `apps/mobile/src/lib/core/db/auth.ts`: export `async sessionCookieHeader(): Promise<string>` that awaits the cookie-jar load (AC-18).
- `apps/mobile/src/lib/core/db/config.ts`: add `backendDataUrl()` derived from `BACKEND_AUTH_URL` (AC-18).
- `apps/mobile/src/lib/core/db/data.ts` (new): the typed backend data client (AC-18).
- `apps/mobile/src/lib/api/useProfile.tsx`, `useSessions.tsx`, `useMemory.tsx`: branch on `IN_BROWSER` and call the data client on native, keeping each hook's shape (AC-18).
- `apps/mobile/src/lib/core/auth/actions.ts`: `syncProfile` uses the data client on native (AC-18).
- `apps/mobile/src/lib/core/db/data.test.ts` (new): unit tests for URL/error mapping (AC-18).

### Data Model and Contracts
App tables (snake_case; better-auth tables stay camelCase):

```
learner_profiles  user_id text pk references "user"(id) on delete cascade,
                  display_name text, level text
practice_sessions id text pk default gen_random_uuid()::text,
                  user_id text not null references "user"(id) on delete cascade,
                  scenario_id text, transcript jsonb default '[]',
                  debrief text, summary text,
                  started_at timestamptz default now(), ended_at timestamptz
robin_memory      id text pk default gen_random_uuid()::text,
                  user_id text not null references "user"(id) on delete cascade,
                  kind text, content text, created_at timestamptz default now()
profiles          id text pk references "user"(id) on delete cascade,
                  email text, display_name text, avatar_url text, updated_at timestamptz
```

`/api/data/*` contract (all resolve the caller with `auth.api.getSession({ headers })`; no session -> 401). Every row is serialized with snake_case keys via explicit drizzle projections (`select({ id, scenario_id: practiceSessions.scenarioId, ... })`), never drizzle's camelCase property keys:
- `GET /profile` -> `learner_profiles` row or `null`
- `PUT /profile` `{ display_name, level }` -> upsert on `user_id`
- `POST /sessions` `{ scenario_id }` -> `{ id }`
- `GET /sessions/open` -> the open row or `null`
- `GET /sessions/recent` -> up to 5 finished rows
- `GET /sessions/:id` -> the row or 404
- `PATCH /sessions/:id` `{ transcript?, debrief?, summary?, ended_at? }` -> updated row (scoped `user_id AND id`)
- `DELETE /sessions` -> remove the caller's rows
- `GET /memory` -> up to 40 rows, `created_at` desc
- `POST /memory` `{ kind, content }` -> `{ id }`
- `DELETE /memory` -> remove the caller's rows
- `PUT /profiles` `{ email, display_name, avatar_url }` -> upsert on `id = user.id`

### Libraries
No new dependencies: `drizzle-orm`, `pg`, `hono`, and `better-auth` already cover the backend; the mobile client uses `fetch` and the existing session cookie jar.

### Risks
- Cold-start data requests race the cookie-jar load: `sessionCookieHeader()` must be async and await `loadSessionCookies()` before reading (AC-18).
- A bearer built from `session.access_token` is unsigned and rejected: the client must replay the cookie.
- Route order: register `/sessions/open` and `/sessions/recent` before `/sessions/:id`.
- `id` addressed writes must include `user_id = session.user.id` so a guessed id cannot touch another user's row.
- `gen_random_uuid()` requires `pgcrypto` (built in on Neon Postgres 13+); the migration depends on it.
- Account deletion cascades only because every app table FKs to `"user"(id)`; a missing FK leaks rows.
- The browser preview kept `db.from`, so the two stores stayed separate (superseded by the browser update below).
- The mobile data tests cannot hit the backend from Jest; AC-19 is proven by the backend `bun test` suite instead.

## Update: browser preview auth and data move to the backend (AC-21 through AC-29)

Status: approved
Spec: SPEC.md

### Approach
Point the browser preview at the same backend the phone uses. Extract the browser
auth wrapper into `src/lib/core/db/browser-auth.ts`, a module that imports only
`./config`, `./moderation-state` (to keep `forgetModeration()` on sign-in/out), and
`@neondatabase/neon-js`, builds a `createClient({ auth: { url:
BACKEND_AUTH_URL, adapter: SupabaseAuthAdapter() }, dataApi: { url:
backendDataUrl() } })` with no `sessionPlugin` (so the browser cookie jar with
`credentials: "include"` carries the session), and wraps it so `onAuthStateChange`
owns a subscriber list that sign-in/verify/sign-out notify. `db/auth.ts` imports
that wrapper, removes the Borel broker helpers, makes `authCall` target
`BACKEND_AUTH_URL` on both surfaces, and returns `"bps_anon"` for the Borel browser
client token. The mobile data client branches only on the credential mechanism
(browser cookie vs native jar), and the hooks drop their `db.from` branch. The
backend applies CORS to `/api/data/*` too, and the served config trusts the preview
origin.

### Affected Code
- `apps/backend/src/app.ts`: register `cors({ origin: trustedOrigins(), credentials: true })` on `/api/data/*` before `app.route("/api/data", dataRouter)` (AC-29).
- `apps/backend/src/conformance.test.ts`: call `adapter.getBetterAuthInstance().changePassword({ newPassword, currentPassword, revokeOtherSessions: false })` and `.deleteUser()`, record `` `${init?.method} ${url}` ``, and assert `POST /api/auth/change-password` and `POST /api/auth/delete-user` (AC-13).
- `apps/backend/src/app.test.ts`: the AC-26/AC-29 CORS assertions are hermetic. In-process, a helper saves `process.env.TRUSTED_ORIGINS`, sets it to `http://localhost:8081`, builds `const scoped = createApp()` (which re-reads `trustedOrigins()` per instance), restores the variable in a `finally`, and asserts the literal `http://localhost:8081` in `Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials: true` (and `204` on the preflight) for `OPTIONS`/credentialed requests to `/api/auth/sign-in/email` and `/api/data/profile`; the existing cookie-bearing evil-origin `POST /api/auth/sign-in/email` still returns `403 INVALID_ORIGIN` with no `Access-Control-Allow-Origin`. Because better-auth reads `trustedOrigins()` at module load, its acceptance of the preview origin (not just Hono's headers) is proven through the served root `.env` or, when unset, a spawned `bun` with `TRUSTED_ORIGINS=http://localhost:8081`, asserting a cookie-bearing `POST /api/auth/sign-in/email` with `Origin: http://localhost:8081` is not `403`.
- `.env.example`: already documents `TRUSTED_ORIGINS` (no change needed) (AC-26); the untracked root `.env` is set to `TRUSTED_ORIGINS=http://localhost:8081` as an operational dev action so the live preview works, not as a suite precondition (AC-26).
- `apps/mobile/src/lib/core/db/browser-auth.ts` (new): `createBrowserAuth(auth)` wrapper factory plus the module-scope `brokerAuth`; imports `./config`, `./moderation-state`, and `@neondatabase/neon-js` (no AsyncStorage) (AC-21, AC-28).
- `apps/mobile/src/lib/core/db/auth.ts`: remove `brokerFetch`/`loadBrokerToken`/`setBrokerToken`; import and re-export `brokerAuth` from `./browser-auth`; browser `client` token provider returns `"bps_anon"`; `authHeader()` returns `"bps_anon"` in the browser; `AUTH_CALL_URL` is `BACKEND_AUTH_URL` on both surfaces; `authCall` uses `credentials: "include"` in the browser; the browser notification lives in the wrapper, not in `tellScreens`/`announceSessionChanges`; drop the now-unused `AUTH_URL`/`PREVIEW_AUTH_URL` imports and correct the now-false comments at `:16-19` (postMessage broker token), `:150-156` ("browser preview keeps Borel's"), and `:350-353` ("getToken ... app-scoped handle") (AC-21, AC-22, AC-24, AC-25, AC-28).
- `apps/mobile/src/lib/core/db/data.ts`: `request()` adds `credentials: "include"` in the browser and keeps the `sessionCookieHeader()` `Cookie` header on native; correct the now-false header comment at `:5-7` (AC-22, AC-23).
- `apps/mobile/src/lib/core/auth/constants.ts`: correct the now-false `IN_PREVIEW` comment (AC-25).
- `apps/mobile/src/lib/core/auth/actions.ts`: `syncProfile` always calls `upsertProfile`; drop the dead Borel-preview fallbacks now that `getBetterAuthInstance()` exists in the browser, and correct the now-false comments at `:114-117` and `:129-130` (AC-23, AC-24).
- `apps/mobile/src/lib/api/useProfile.tsx`, `useSessions.tsx`, `useMemory.tsx`: remove the `IN_BROWSER` `db.from` branch, always the data client (AC-23).
- Mobile tests: `src/lib/core/db/browser-auth.test.ts` (new, browser-mode; AC-21, AC-28), a browser-mode case in `src/lib/core/db/data.test.ts` (whose `./config` mock must add `IN_BROWSER`, since it currently mocks only `backendDataUrl`) (AC-22, AC-23), a browser-mode case in `src/lib/api/data-hooks.test.tsx` (AC-23), and a wrapper test for `updatePassword`/`deleteAccount` through `getBetterAuthInstance` that also asserts `PASSWORD_RESET_AVAILABLE === true` and `AUTH_REDIRECT_URL === BACKEND_AUTH_URL` stay true (AC-24).
- Gates: run root `bun run lint`, `bun run typecheck`, and `bun run test` (backend `bun test`, mobile `jest`), then `bun run build` last; database-backed tests skip with a reported reason when no database is configured (AC-27).
- `apps/mobile/package.json`: no `jest.transformIgnorePatterns` change; the SDK is mocked, not loaded.

### Data Model and Contracts
- Browser auth client config: `createClient({ auth: { url: string, adapter: SupabaseAuthAdapter }, dataApi: { url: string } })`; the `dataApi` key is required by the SDK, which dereferences `dataApi.options` and `dataApi.url` unconditionally.
- Auth wrapper: `createBrowserAuth(auth)` returns `{ signUp, signInWithPassword, verifyOtp, getSession, signOut, onAuthStateChange, getBetterAuthInstance }`. `onAuthStateChange(cb)` returns `{ data: { subscription: { unsubscribe } } }` (the shape `context.tsx` consumes). `signInWithPassword`, `verifyOtp`, and `signOut` each call `auth.getSession({ forceFetch: true })`, call `forgetModeration()`, and invoke every subscriber.
- Browser data request: `fetch(url, { credentials: "include", ... })`, never a `Cookie` header. Native: `sessionCookieHeader()` as the `Cookie` header.
- Backend CORS: the same `cors({ origin: trustedOrigins(), credentials: true })` middleware on `/api/auth/*` and `/api/data/*`.

### Libraries
- `better-auth@1.6.23`: `trustedOrigins` and cookie sessions; context7 confirms `trustedOrigins` plus a CORS `credentials: true` layer is the supported cross-origin cookie setup.
- `@neondatabase/neon-js@0.7.0-beta`: `createClient` object form for the browser auth client (`dataApi` mandatory).
- `@neondatabase/auth@0.5.0-beta`: `SupabaseAuthAdapter` and its `getBetterAuthInstance()` (`changePassword`, `deleteUser`).
- `hono@^4.13.13`: `hono/cors` on `/api/data/*`.

### Risks
- A mocked-SDK test cannot observe real request inits: assert the `createClient` config and the adapter spy, and rely on the backend conformance test (AC-13) for per-method URLs.
- `createClient` throws without a `dataApi` key: pin the full config and assert it.
- `@react-native-async-storage/async-storage` has no Jest native module: keep the browser wrapper in `browser-auth.ts`, which never imports it.
- A hosted cross-site preview would need an HTTPS backend and `SameSite=None` cookies: out of scope; only the same-site local preview is required.
- The root `.env` is untracked and lacks `TRUSTED_ORIGINS`: set it for local dev (AC-26), and keep the committed documentation in `.env.example`.
- `db.auth.updateUser`/`resetPasswordForEmail`/`resend` have no callers; the wrapper does not need them.
- Removing the browser `db.from` branch is a behavior change; no caller outside the changed hooks and `syncProfile` uses it.
- The browser cookie session relies on better-auth's client default `credentials: "include"` (`better-auth/dist/client/config.mjs`); the options-level test only proves no override, so a future SDK change could silently flip it. Mitigation: state the dependency in the wrapper and pin the no-override assertion.
- The browser wrapper replaces the adapter's `onAuthStateChange`, so the adapter's cross-tab broadcast subscription (kept on native via `announceSessionChanges`, `db/auth.ts:413-451`) is dropped in the browser; cross-tab sync in the preview is out of scope, and the wrapper's own list covers same-tab sign-in/verify/sign-out.
- `AUTH_URL` and `PREVIEW_AUTH_URL` become unused in `db/auth.ts`; leave the `EXPO_PUBLIC_*` env vars in `.env.example` (other Borel surfaces still document them) but remove the dead imports.
