# Backend and AI

Source paths are relative to `apps/mobile/` unless noted.

The app is client-only. Remote work is split between the Borel cloud proxy and
OpenRouter. The `db` object is assembled in `src/lib/core/db.ts` and every
submodule is reachable from there.

`apps/backend/` is the `@robin-talks/backend` Hono workspace. It shares the
repository's single root install and root `.env` (see [workflows.md](workflows.md)),
and its `typecheck`, `build`, `dev`, `test`, `lint`, and database scripts run either
through the root Turborepo scripts or directly in that directory. It is not imported
by the mobile app; its auth service is described next.

## Backend auth service (`apps/backend`)

The backend runs a better-auth account service on Hono, mounted at `/api/auth/*`
and backed by drizzle over a Neon Postgres database. The mobile app is not
repointed to it yet: `EXPO_PUBLIC_AUTH_URL` still points at Borel, and the Data
API, storage, AI images, moderation, notifications, and account deletion still go
through `api.borel.one`. Those Borel surfaces consume the same session token, so
the repoint is a follow-up; a backend test (`src/conformance.test.ts`) proves the
backend serves the exact paths the mobile client issues.

- **Server** (`src/app.ts`, `src/index.ts`): `createApp()` returns a Hono app with
  `GET /health` -> `{ status: "ok" }`, CORS scoped to `/api/auth/*` with
  `trustedOrigins()` and credentials, and `app.all("/api/auth/*", (c) =>
  auth.handler(c.req.raw))`. `index.ts` default-exports `app` and, under
  `import.meta.main`, calls `requireDatabaseUrl()` then `Bun.serve`.
- **Auth config** (`src/auth.ts`): `betterAuth` 1.6.23 with
  `drizzleAdapter(getDb(), { provider: "pg", schema })`; `baseURL`, `secret`, and
  `trustedOrigins` from `src/env.ts`; email+password enabled with
  `requireEmailVerification: true` and `minPasswordLength: 8`; `emailVerification:
  { sendOnSignIn: true }`; `user.deleteUser.enabled`; `useSecureCookies` derived
  from an `https` base URL; origin checks on. The `emailOTP` plugin
  (`otpLength: 6`, `overrideDefaultEmailVerification: true`) handles email
  verification and password reset and hands each code to the transport seam.
- **Tables** (`src/db/schema.ts`): better-auth's four tables `user` (a quoted
  reserved word), `session`, `account`, and `verification`, with better-auth's
  camelCase columns, unique `user.email` and `session.token`, indexed
  `verification.identifier`, and cascade FKs `session.userId`/`account.userId` ->
  `user.id`. The committed migration is `drizzle/0000_lean_george_stacy.sql`.
- **Database** (`src/db/client.ts`, `src/db/index.ts`): a lazy memoized `getDb()`
  builds one `drizzle(new Pool({ connectionString: databaseUrlOrNull() ?? undefined
  }), { schema })`; it does not connect or throw when no database is configured.
- **Flows** (emailOTP): sign-up creates an unverified `user` and emails a 6-digit
  code; `POST /email-otp/verify-email` marks the email verified; signing in an
  unverified account is refused and re-sends a code; `POST
  /forget-password/email-otp` issues a reset code (an unknown address succeeds with
  no code, so accounts cannot be enumerated) and `POST /email-otp/reset-password`
  applies a new password, with `/email-otp/request-password-reset` as the forward
  path; `POST /change-password` changes the password and can retain other sessions;
  `POST /delete-user` removes the user and cascades its session and account rows.
- **OTP transport** (`src/mail/otp-transport.ts`): `createOtpTransport(mailConfig())`
  returns the dev transport when `MAIL_PROVIDER` is unset, which logs the code and
  pushes `{ email, otp, type }` to an exported in-process `outbox` (`resetOutbox`
  clears it, both used by tests), and a `fetch`-based provider transport when it is
  set. Provider completeness is checked in `send`.
- **Env vars** (`src/env.ts`): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `PGHOST`/`PGHOST_UNPOOLED`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`, `BETTER_AUTH_URL`
  (default `http://localhost:3000`), `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`,
  `MAIL_PROVIDER`/`MAIL_API_KEY`/`MAIL_FROM`, and `PORT`. `authSecret()` returns a
  documented dev constant when `NODE_ENV !== "production"` and throws otherwise;
  the module never throws at import. `.env.example` lists the full set.
- **Tests and scripts**: `bun test` with `bun:test`; `db:generate`, `db:migrate`,
  and `db:verify` (runs `migrate` twice, then asserts the four tables through
  `information_schema`). The database-backed tests skip with a reported reason when
  no database is configured, so the suite stays green in a database-less
  environment. `build` compiles `src` (excluding `*.test.ts`) through
  `tsconfig.build.json`.

## The `db` object

`src/lib/core/db.ts` (Borel-managed) re-exports the `db/` submodules and builds:

```ts
export const db = Object.assign(client, {
  auth: IN_BROWSER ? brokerAuth : native().auth,
  storage, ai, account, moderation, notify,
});
```

`client` (the Data API client) is created with `@neondatabase/neon-js`
`createClient` in `src/lib/core/db/auth.ts`. It exposes a PostgREST-style
`db.from("table").select()/insert()/update()/delete()/upsert()` surface.

## Configuration (`src/lib/core/db/config.ts`)

All configuration is `EXPO_PUBLIC_*` values inlined by Expo:

- `DATA_API_URL`, `AUTH_URL`, `PREVIEW_AUTH_URL`, `BOREL_STORAGE`, `BOREL_AI`,
  `BOREL_ACCOUNT`, `BOREL_USAGE_URL`, `BOREL_INVITE_URL`
- `OPENROUTER_API_KEY` (`EXPO_PUBLIC_OPENROUTER_API_KEY`)
- `IN_BROWSER` (`typeof document !== "undefined"`), `SURFACE`
  (`"preview" | "dev" | "release"`), `BUILD_STAMP`, and `borelHeaders()` which
  sends `X-Borel-Surface` (and `X-Borel-Build` in a release build).
- `createInviteLink(code)` composes `BOREL_INVITE_URL`.

## Borel cloud proxy

`api.borel.one` fronts the app's own cloud. Borel attaches credentials
server-side, so no secret is held in `db.ts`. Every row is still governed by the
tables' row-level security policies.

- **Data API** (`DATA_API_URL`): Postgres reads/writes through `db.from`.
- **Auth** (`AUTH_URL` / `PREVIEW_AUTH_URL`): accounts, sessions, OTP codes,
  password reset. See [auth.md](auth.md).
- **Storage** (`BOREL_STORAGE`, `src/lib/core/db/storage.ts`): presign, upload,
  confirm, sign, remove, and `getPublicUrl`. Limits are 25 MB per file, 200 MB
  per video.
- **Account** (`BOREL_ACCOUNT`): `account.delete()` removes the account, its
  rows, and its files.
- **AI images** (`BOREL_AI`): `ai.image` and `ai.editImage` POST to
  `/images/generations` and `/images/edits`. Borel makes and stores the picture
  and returns a ready URL; identical prompts reuse the stored image. These paths
  still use `borelFetch` and Borel's refusal handling.
- **Moderation** (`BOREL_ACCOUNT`'s sibling `/moderation`,
  `src/lib/core/db/moderation.ts`): report, block/unblock, load state, and
  `check(text)`. The reported/blocked cache lives in
  `src/lib/core/db/moderation-state.ts`, which `db/auth.ts` imports directly so
  `auth` can forget a person's state on sign-in and sign-out without importing
  the client, which needs auth for its bearer token. `moderation.ts` re-exports
  `forgetModeration` from there.
- **Notifications** (`src/lib/core/db/notify.ts`): `borelFetch(url, body,
  timeoutMs)` (used by image generation), `notify.notify(input)` to push to named
  users, and device-token linking that follows the signed-in user. This file also
  runs `watchDevice()` at import time. Telling the screens who is signed in
  lives in `db/auth.ts` as `tellScreens` and `announceSessionChanges`, because
  it has to wrap the auth client's own methods.

## OpenRouter AI (`src/lib/core/db/ai.ts`)

Chat and speech-to-text go directly from the device to OpenRouter; only image
generation stays on Borel.

- **Client:** `new OpenRouterCore({ apiKey: OPENROUTER_API_KEY, retryConfig: {
  strategy: "none" } })` and the standalone `chatSend` for tree-shaking. SDK
  retries are off because the JSON loop retries on its own. A missing key
  resolves the neutral error before any request and never triggers a consent
  prompt.
- **Models:** `ai.models.fast` and `ai.models.smart` are both
  `openai/gpt-6-luna`. Transcribed audio uses `AI_AUDIO_MODEL`
  (`qwen/qwen3-asr-0.6b`, `src/lib/core/db/consent.ts:21`).
- **Chat:** `chat(input)` sends one request with a 60 s `AbortController` timeout.
  It takes `jsonSchema?: AiJsonSchema`, which becomes OpenRouter's
  `response_format` `{ type: "json_schema", jsonSchema: { name, strict: true,
  schema } }`; every request also pins `provider: { only: ["openai"] }`. With a
  schema, the reply is parsed with `readJson` (code fences and surrounding words
  tolerated; balanced object/list search) and retried once when it cannot be
  read; without one the reply comes back as plain text. A `finishReason ===
  "length"` reply sets `truncated`. Photos in message parts are turned into
  `data:` URLs by `sendableImage` before sending.
- **Schema type:** `AiJsonSchema` (`{ name, schema }`) is exported from
  `ai.ts`, so callers describe the shape they want instead of asking for JSON in
  prose. `src/lib/api/useRobin.tsx` is its only current caller.
- **Transcribe:** `transcribe(input)` turns a recording into raw base64 with a
  short format name (`sendableAudio`, `audioFormatOf`), enforces a 3 MB / 4 MB
  cap client-side, then POSTs `{ model, input_audio: { data, format } }` to
  `/audio/transcriptions`. `language` and `prompt` are accepted and ignored. A
  recording whose base64 is empty, or whose uri-only payload reads back empty,
  resolves the "no words" sentence without any network request
  (`src/lib/core/db/ai.ts:510`). Empty `text` in a successful reply means no
  speech.
- **Result shapes:** `AiChatResult` carries `text`, `data`, `error`, `status`,
  `reason`, `truncated`, `raw`, `detail`; `AiTranscribeResult` carries `text`,
  `error`, `status`, `reason`, `detail`. Technical text always goes to `detail`.

### Error mapping (`src/lib/core/db/errors.ts` and `ai.ts`)

Every failure becomes one plain sentence. OpenRouter codes map as:
402/404 → "AI isn't available right now", 403/429 → "AI has reached today's
limit", 401/502 → "The AI couldn't answer that right now", network failure →
"Couldn't reach the AI", timeout → "The AI took too long". The API's own message
is shown only when it passes `looksPlain` (one capitalised, punctuated sentence
with no code characters or technical words); otherwise it stays in `detail`.
`plainError(error, action)` provides the Data API equivalents.

## AI consent (`src/lib/core/db/consent.ts`)

Before any chat, photo, audio, image, or edit call, `askAiConsent(kind, model)`
shows an `Alert` naming the recipient and the model maker. "Allow" is stored in
AsyncStorage under `borel.aiConsent.v1:<key>` and remembered for the session;
"Don't Allow" is not stored, so the next use asks again. Keys are per kind:
`openrouter:chat`, `openrouter:photo`, `openrouter:audio`, and `openai:image`,
`openai:edit` for the Borel image paths. `AI_MAKERS` maps `openai/gpt-6-luna` to
"GPT-6 by OpenAI" and `qwen/qwen3-asr-0.6b` to "Qwen3 ASR by Alibaba".

## Polyfills

`src/lib/polyfills/` is imported at the top of `expo-entry.js`, before the app:
`cryptoPolyfill` (backs `crypto.randomUUID`/`getRandomValues` via expo-crypto for
Hermes), `responsePolyfill` (adds the `Response.json` static), and `alertPolyfill`
(replaces `react-native-web`'s empty `Alert.alert` with a DOM dialog carrying the
same title/message/buttons/cancelable shape).
