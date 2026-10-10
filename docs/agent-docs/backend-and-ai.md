# Backend and AI

Source paths are relative to `apps/mobile/` unless noted.

The app is client-only. Remote work is split between the backend
service in `apps/backend` (auth, the app's data, and all AI transport) and the
Borel cloud proxy (file storage, moderation, notifications, and the account and
usage/invite links); AI image generation reaches Borel through the backend's
proxy, so the device never talks to OpenRouter or Borel's AI endpoints directly.
The `db`
object is assembled in `src/lib/core/db.ts` and every submodule is reachable from
there.

`apps/backend/` is the `@robin-talks/backend` Hono workspace. It shares the
repository's single root install and root `.env` (see [workflows.md](workflows.md)),
and its `typecheck`, `build`, `dev`, `test`, `lint`, and database scripts run either
through the root Turborepo scripts or directly in that directory. The native app
reaches it over HTTP for auth, its own data, and AI; its auth service, data API,
and AI router are described next.

## Backend auth service (`apps/backend`)

The backend runs a better-auth account service on Hono, mounted at `/api/auth/*`,
an authenticated data API at `/api/data/*`, and an authenticated AI router at
`/api/ai`, all backed by drizzle over a Neon
Postgres database. Both surfaces authenticate against it through
`EXPO_PUBLIC_BACKEND_URL` (an `/api` base from which `config.ts` derives the
`/auth`, `/data`, and `/ai` mounts) and read and write their profile, sessions,
and memory through `/api/data/*`. File storage, moderation, notifications, and
the account and usage/invite links still go through `api.borel.one` directly; AI
image generation reaches Borel through the backend's proxy. A
backend test (`src/conformance.test.ts`) proves the backend serves the exact auth
paths the mobile client issues.

- **Server** (`src/app.ts`, `src/index.ts`): `createApp()` returns a Hono app with
  `GET /health` -> `{ status: "ok" }`, CORS with
  `trustedOrigins()` and credentials on `/api/auth/*`, `/api/data/*`, and
  `/api/ai/*`, `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`,
  `app.route("/api/data", dataRouter)`, and
  `app.route("/api/ai", aiRouter)`. `index.ts`
  default-exports `app` and, under `import.meta.main`, calls
  `requireDatabaseUrl()` then `Bun.serve`.
- **Auth config** (`src/lib/auth.ts`): `betterAuth` 1.6.23 with
  `drizzleAdapter(getDb(), { provider: "pg", schema })`; `baseURL`, `secret`, and
  `trustedOrigins` from `src/lib/env.ts`; email+password enabled with
  `requireEmailVerification: true` and `minPasswordLength: 8`; `emailVerification:
  { sendOnSignIn: true }`; `user.deleteUser.enabled`; `session: { freshAge: 0 }`
  (no freshness gate on `delete-user`); `useSecureCookies` derived
  from an `https` base URL; origin checks on. The `emailOTP` plugin
  (`otpLength: 6`, `overrideDefaultEmailVerification: true`) handles email
  verification and password reset and hands each code to the transport seam.
- **Tables** (`src/lib/db/schema/`): `auth-schema.ts` holds better-auth's four
  tables `user` (a quoted
  reserved word), `session`, `account`, and `verification`, with better-auth's
  camelCase columns, unique `user.email` and `session.token`, indexed
  `verification.identifier`, and cascade FKs `session.userId`/`account.userId` ->
  `user.id`; `schema.ts` holds the four app tables (see the data API below);
  `index.ts` re-exports both. The committed migrations are
  `drizzle/0000_lean_george_stacy.sql`
  (auth tables) and `drizzle/0001_complete_silver_fox.sql` (the four app tables).
- **Database** (`src/lib/db/client.ts`, `src/lib/db/index.ts`): a lazy memoized `getDb()`
  builds one `drizzle(new Pool({ connectionString: databaseUrlOrNull() ?? undefined
  }), { schema })`; it does not connect or throw when no database is configured.
- **Flows** (emailOTP): sign-up creates an unverified `user` and emails a 6-digit
  code; `POST /email-otp/verify-email` marks the email verified; signing in an
  unverified account is refused and re-sends a code; `POST
  /forget-password/email-otp` issues a reset code (an unknown address succeeds with
  no code, so accounts cannot be enumerated) and `POST /email-otp/reset-password`
  applies a new password, with `/email-otp/request-password-reset` as the forward
  path; `POST /change-password` changes the password and can retain other sessions;
  `POST /delete-user` removes the user and cascades its session, account, and app
  data rows.
- **OTP transport** (`src/lib/mail/otp-transport.ts`): `createOtpTransport(mailConfig())`
  returns the dev transport when `MAIL_PROVIDER` is unset, which logs the code and
  pushes `{ email, otp, type }` to an exported in-process `outbox` (`resetOutbox`
  clears it, both used by tests), and a Resend transport when it is `resend`. The
  Resend transport checks completeness in `send`, builds `new Resend(config.apiKey)`,
  and throws on a returned `{ error }` (the SDK does not throw). An unsupported
  provider throws `Unsupported mail provider: <value>`. The pure
  `renderOtpEmail(payload)` maps each `OtpType` to a fixed subject and a shared
  text/html body carrying the code.
- **Env vars** (`src/lib/env.ts`): `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`,
  `BETTER_AUTH_URL`
  (default `http://localhost:3000`), `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`,
  `MAIL_PROVIDER`/`MAIL_API_KEY`/`MAIL_FROM`, `OPENROUTER_API_KEY` and
  `BOREL_AI_URL` (the AI router's keys, read at call time by
  `openRouterApiKey()`/`borelAiUrl()`), and `PORT`. Migrations derive the
  unpooled host by stripping `-pooler` from `PGHOST`. `authSecret()` returns a
  documented dev constant when `NODE_ENV !== "production"` and throws otherwise;
  the module never throws at import. `.env.example` lists the full set.
- **Tests and scripts**: `bun test` with `bun:test`; `db:generate`, `db:migrate`,
  and `db:verify` (runs `migrate` once, then asserts the auth and app tables
  through `information_schema`). The database-backed tests skip with a reported
  reason when no database is configured, so the suite stays green in a
  database-less environment. `build` compiles `src` (excluding `*.test.ts`) through
  `tsconfig.build.json`.

## Backend data API (`apps/backend/src/routes/`)

`src/routes/data/index.ts` is mounted at `/api/data` by `createApp()`
(`src/app.ts:19`). A middleware resolves the caller from the better-auth session
cookie with `auth.api.getSession({ headers: c.req.raw.headers })`, returns 401
`{ error: "You need to sign in first." }` when there is no session, and sets the
route's `userId`. The operations live in four sibling routers,
`src/routes/data/profile.ts`, `sessions.ts`, `memory.ts`, and `profiles.ts`, mounted
under it. There is no bearer path, so the native data client replays the
persisted session cookie and the browser sends its cookie with
`credentials: "include"` (see [auth.md](auth.md)). Every read and write is scoped
to the session user: reads filter on `user_id = session.user.id`; `GET`/`PATCH
/sessions/:id` require `user_id AND id`, so a guessed id is a 404; `DELETE
/sessions` and `/memory` remove only the caller's rows; `profiles` is keyed by
`id = user.id`. Responses carry snake_case keys through explicit drizzle
projections.

- `GET /profile` -> the `learner_profiles` row or `null`
- `PUT /profile` `{ display_name, level }` -> upsert on `user_id`
- `POST /sessions` `{ scenario_id }` -> `{ id }`. The handler first closes
  any open session (`ended_at = now()` where `ended_at is null`) so each user
  has at most one open session, then inserts with an empty transcript.
- `GET /sessions/open` -> the open row (`ended_at is null`, newest first) or `null`
- `GET /sessions/recent` -> up to 5 ended rows, newest first
- `GET /sessions/:id` -> the row or 404
- `PATCH /sessions/:id` `{ transcript?, debrief?, summary?, ended_at? }` -> updated row
- `DELETE /sessions` -> remove the caller's rows
- `GET /memory` -> up to 40 rows, `created_at` desc
- `POST /memory` `{ kind, content }` -> `{ id }`
- `DELETE /memory` -> remove the caller's rows
- `PUT /profiles` `{ email, display_name, avatar_url }` -> upsert on `id`

The four app tables (`learner_profiles`, `practice_sessions`, `robin_memory`,
`profiles`) are added by `drizzle/0001_complete_silver_fox.sql` with snake_case
columns, `gen_random_uuid()::text` ids for the two generated-id tables, and
`ON DELETE CASCADE` foreign keys to `"user"(id)`. The mobile data client is
`src/lib/core/db/data.ts` (see [api-layer.md](api-layer.md)). `src/routes/router.test.ts`
drives `app.request` with a signed-in cookie across the operations, the
second-user isolation cases, and the account-deletion cascade; it skips with a
reported reason when no database is configured.

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
`db.from("table").select()/insert()/update()/delete()/upsert()` surface. The app's
own domain data does not use it on either surface: `useProfile`, `useSessions`,
and `useMemory` call `src/lib/core/db/data.ts`, which speaks to `/api/data/*`.

In the browser the `auth` half of `db` is `brokerAuth`, re-exported from
`src/lib/core/db/auth.ts` and built in `src/lib/core/db/browser-auth.ts`.
`createBrowserAuth(auth)` wraps one neon-js `createClient({ auth: { url:
BACKEND_AUTH_URL, adapter: SupabaseAuthAdapter() }, dataApi: { url:
BACKEND_DATA_URL } })` with no session plugin, so the browser's own cookie jar
carries the session. It keeps its own `onAuthStateChange` subscriber list and
calls `getSession({ forceFetch: true })` after sign-in, OTP verification, and
sign-out to notify subscribers, because the neon-js adapter otherwise notifies
only on cross-tab broadcasts. `getBetterAuthInstance()` passes through to the
underlying client, which `updatePassword` and `deleteAccount` use.

## Configuration (`src/lib/core/db/config.ts`)

All configuration is `EXPO_PUBLIC_*` values inlined by Expo:

- `DATA_API_URL`, `AUTH_URL`, `PREVIEW_AUTH_URL`, `BACKEND_AUTH_URL`,
  `BACKEND_DATA_URL`, `BACKEND_AI_URL`, `BOREL_STORAGE`, `BOREL_ACCOUNT`,
  `BOREL_USAGE_URL`, `BOREL_INVITE_URL`
- `IN_BROWSER` (`typeof document !== "undefined"`), `SURFACE`
  (`"preview" | "dev" | "release"`), `BUILD_STAMP`, and `borelHeaders()` which
  sends `X-Borel-Surface` (and `X-Borel-Build` in a release build).
- `BACKEND_AUTH_URL`, `BACKEND_DATA_URL`, and `BACKEND_AI_URL` append `/auth`,
  `/data`, and `/ai` to `EXPO_PUBLIC_BACKEND_URL` (an `/api` base), and are `""`
  when that variable is unset.
- `createInviteLink(code)` composes `BOREL_INVITE_URL`.

## Borel cloud proxy

`api.borel.one` fronts the app's own cloud. Borel attaches credentials
server-side, so no secret is held in `db.ts`.

- **Data API** (`DATA_API_URL`): the neon-js client is still built against it and
  `db.from` is still exposed, but no screen calls it; the app's tables live behind
  the backend's `/api/data` on both surfaces.
- **Auth** (`AUTH_URL` / `PREVIEW_AUTH_URL`): these Borel endpoints remain in
  config, but the auth flows target the backend on both surfaces. See
  [auth.md](auth.md).
- **Storage** (`BOREL_STORAGE`, `src/lib/core/db/storage.ts`): presign, upload,
  confirm, sign, remove, and `getPublicUrl`. Limits are 25 MB per file, 200 MB
  per video.
- **Account** (`BOREL_ACCOUNT`): `account.delete()` removes the account, its
  rows, and its files. Account deletion from the app now calls the backend's
  `/api/auth/delete-user` instead.
- **AI images** (`BOREL_AI_URL`, backend-only): `ai.image` and `ai.editImage`
  POST to the backend's `/api/ai/images/generations` and `/images/edits`, and
  the backend forwards them to `BOREL_AI_URL` + path (see the AI section
  below). Borel makes and stores the picture
  and returns a ready URL; identical prompts reuse the stored image. The
  client still sends `borelHeaders()` and the auth bearer so Borel's metering
  and surface policy behave as when it was called directly.
- **Moderation** (`BOREL_ACCOUNT`'s sibling `/moderation`,
  `src/lib/core/db/moderation.ts`): report, block/unblock, load state, and
  `check(text)`. The reported/blocked cache lives in
  `src/lib/core/db/moderation-state.ts`, which `db/auth.ts` imports directly so
  `auth` can forget a person's state on sign-in and sign-out without importing
  the client, which needs auth for its bearer token. `moderation.ts` re-exports
  `forgetModeration` from there.
- **Notifications** (`src/lib/core/db/notify.ts`): `borelFetch(url, body,
  timeoutMs)` (now used only by the notify call), `notify.notify(input)` to push to named
  users, and device-token linking that follows the signed-in user. This file also
  runs `watchDevice()` at import time. Telling the screens who is signed in
  lives in `db/auth.ts` as `tellScreens` and `announceSessionChanges`, because
  it has to wrap the auth client's own methods.

## AI (`apps/backend/src/routes/ai/` and `src/lib/ai/`, plus the thin client `src/lib/core/db/ai.ts`)

All AI transport runs in the backend's `/api/ai` router, mounted by `createApp()`
(`src/app.ts`). `src/routes/ai/index.ts` exports the `aiRouter` const (same shape
as `dataRouter`): a session-gate middleware plus four sub-router consts
(`chatRouter` in `chat.ts`, `transcribeRouter` in `transcribe.ts`,
`generationRouter` in `generations.ts`, `editRouter` in `edits.ts`), mounted at
`/chat`, `/transcribe`, `/images/generations`, and `/images/edits`. There is no
router factory and no injected deps object: each sub-router is a plain const and
the provider calls use the real implementations directly: better-auth's
`auth.api.getSession({ headers })`, the SDK's standalone `chatSend` imported
directly in `chat.ts`, and real `fetch` through the timeout helpers in
`src/lib/ai/functions.ts` (each racing its own `AbortController` timeout).
`src/routes/ai/ai.test.ts` (44 tests) patches those modules with
`bun:test`'s `mock.module`, so the suite needs no database or network.

Shared AI types and helpers live in `src/lib/ai/`: `types.ts` (`ChatMessage`,
`AiJsonSchema`, result shapes, the `AiSession` gate type, and the `FetchSeam`
fetch-seam type; the chat fake type lives locally in the test), `constants.ts` (models, timeouts, audio cap),
`functions.ts` (`looksPlain`, `openRouterSays`, timeout fetches, JSON and image
proxies), re-exported by `index.ts`.

- **Gate:** router middleware resolves the better-auth session from the cookie
  on every `/api/ai/*` path; no session is 401
  `{ "error": "You need to sign in first." }` (a lookup that throws counts as
  signed out), and 200 with a result body is the only other outcome.
- **`POST /chat`:** OpenRouter chat completions through `@openrouter/sdk`.
  `openRouterCore()` in `chat.ts` memoizes one module-scope `OpenRouterCore`
  (`{ apiKey: openRouterApiKey(), retryConfig: { strategy: "none" } }`) and
  `chatSend` is called with `retries: { strategy: "none" }`, because the JSON loop retries on its own.
  Every request pins `provider: { only: ["openai"] }`. Models are allow-listed
  (`openai/gpt-6-luna`, the only value the client sends; it is the default when
  `model` is omitted). A 60 s budget (`AI_TIMEOUT_MS`) covers one request.
- **Structured output:** a `jsonSchema?: AiJsonSchema` (`{ name, schema }`)
  becomes OpenRouter's `response_format` `{ type: "json_schema", jsonSchema: {
  name, strict: true, schema } }`. On that path the backend reads the reply
  with `readJson` (code fences and surrounding words tolerated; balanced
  object/list search) and retries once (2 attempts in total) before answering
  the "unreadable" sentence. A `finishReason === "length"` reply sets
  `truncated`; on the schema path that becomes the "too long" sentence.
  Without a schema the reply comes back as plain text. An unset
  `OPENROUTER_API_KEY` resolves the "failed" sentence (with `detail`) before
  any request.
- **`POST /transcribe`:** plain `fetch` to OpenRouter's
  `/audio/transcriptions` with the pinned model `qwen/qwen3-asr-0.6b`
  (`AI_AUDIO_MODEL`); the body is `{ audio: { data, format } }`, so callers'
  `language` and `prompt` are dropped. The 3 MB cap (`MAX_AUDIO_BASE64`)
  and empty-body guards answer locally with the "too long" or "no words"
  sentence; empty `text` in a success means no speech.
- **`POST /images/generations` and `/images/edits`:** a transparent Borel proxy
  to `borelAiUrl()` + `/images/generations|/images/edits` with a 150 s budget
  (`BOREL_TIMEOUT_MS`). The caller's `Authorization`, `X-Borel-Surface`, and
  `X-Borel-Build` headers are forwarded verbatim, Borel's refusal reasons
  (`wallet_empty`, `daily_allowance_used`, `cloud_paused`, plus the 402 text
  patterns) map to the standing sentences, and success carries Borel's own
  `reused` flag (null when Borel sent none).
- **Result shapes:** `AiChatResult` carries `text`, `data`, `error`, `status`,
  `reason`, `truncated`, `raw`, `detail`; `AiTranscribeResult` carries `text`,
  `error`, `status`, `reason`, `detail`; `AiImageResult` carries `url`, `error`,
  `status`, `reason`, `reused`. Technical text always goes to `detail`.

### The mobile thin client (`src/lib/core/db/ai.ts`)

`db.ai` keeps its public surface verbatim (`ai.chat`, `ai.transcribe`,
`ai.image`, `ai.editImage`, and `ai.models`, where `fast` and `smart` are both
`openai/gpt-6-luna`, plus ten type exports) and only POSTs to `BACKEND_AI_URL`
+ `/chat`, `/transcribe`, `/images/generations`, and `/images/edits` through
`aiRequest`. Native replays the stored session cookie header
(`sessionCookieHeader()`); the browser sends `credentials: "include"`. The image
paths also send `borelHeaders()` and the auth bearer, which the backend forwards
to Borel. Client timeouts are 65 s (chat and transcribe) and 160 s (images),
the backend's 60 s/150 s budgets plus margin. What stays device-side:

- **Consent** per kind (`chat`, `photoChat`, `audio`, `image`, `editImage`),
  asked before anything leaves the device.
- **Device-file normalization:** `sendableImage` (a picker result, asset, uri,
  https address, or base64 becomes something the backend can read) and
  `sendableAudio` (a recording, its whole result, or a data: URL becomes
  `{ data, format }` via `audioFormatOf`), with the 3 MB cap still enforced
  client-side and empty recordings resolving "no words" without a request.
- **Image-only in-flight dedupe:** one request per `prompt|size` key
  (`inFlightImages`); failures are dropped from the map so a retry is possible.
- **Metering and refusals:** in the browser, an image success with
  `reused !== true` posts `{ type: "ai:metered" }` to the parent window
  (`postToParent`), and image refusal reasons go through `noteRefusal`.
- **Transport mapping:** timeout, non-401 `!ok`, 401, and unset
  `BACKEND_AI_URL` map to plain sentences (`AI_SAYS`); the backend's sentences
  pass through in the result body.

### Error mapping (`apps/backend/src/lib/ai/functions.ts` and `src/lib/core/db/errors.ts`)

Every failure becomes one plain sentence. The backend maps OpenRouter codes
(`openRouterSays` in `src/lib/ai/functions.ts`): 402/404 → "AI isn't available right now", 403/429 → "AI has
reached today's limit", 401/502 → "The AI couldn't answer that right now",
network failure → "Couldn't reach the AI", timeout → "The AI took too long".
The API's own message
is shown only when it passes `looksPlain` (one capitalised, punctuated sentence
with no code characters or technical words); otherwise it stays in `detail`.
The client's `aiRequest` maps its own transport failures (timeout, offline,
401, unconfigured backend), and `plainError(error, action)` provides the Data
API equivalents.

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
