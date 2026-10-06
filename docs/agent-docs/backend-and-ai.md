# Backend and AI

Source paths are relative to `apps/mobile/` unless noted.

The app is client-only. Remote work is split between the Borel cloud proxy and
OpenRouter. The `db` object is assembled in `src/lib/core/db.ts` and every
submodule is reachable from there.

`apps/backend/` is the `@robin-talks/backend` Hono workspace (`src/index.ts`, a
hello-world `GET /`). It shares the repository's single root install and root
`.env` (see [workflows.md](workflows.md)), and its `typecheck`, `build`, and
`dev` scripts run either through the root Turborepo scripts or directly in that
directory. It is not imported by the mobile app and holds no app logic yet; the
commit that added it describes it as preparation to move off the Borel proxy.

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
