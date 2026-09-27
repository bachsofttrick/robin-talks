# Backend and AI

All cloud access is centralised in `core/db.ts`, which is marked "Managed by Borel" and regenerated (`core/db.ts:1-2`). The app holds no server code and no API keys.

## Endpoints

Borel URLs are string constants in `core/db.ts:16-24`:

| Constant | Purpose |
|---|---|
| `DATA_API_URL` | Postgres Data API (used by `db.from(...)` and the neon-js client) |
| `AUTH_URL` | Email/password sign-in, OTP, password reset |
| `PREVIEW_AUTH_URL` | Brokered session used only in the browser preview |
| `BOREL_STORAGE` | File upload, public/signed URLs, delete |
| `BOREL_AI` | Chat completions, transcription, image generation/editing |
| `BOREL_ACCOUNT` | Account deletion; the `/moderation` and `/notify` paths are derived from it (`core/db.ts:911`, `:1663`) |
| `BOREL_APPLE` | Sign in with Apple nonce and sign-in |
| `BOREL_USAGE_URL`, `BOREL_INVITE_URL` | Owner usage page and invite-code sharing |

Every request carries an `X-Borel-Surface` header (`preview` / `dev` / `release`) and a build stamp on release builds (`core/db.ts:50-67`).

## Database tables

The schema is not defined in this repository; the code reads and writes four tables through `db.from(...)`:

- `profiles` - upserted on sign-in with `id`, `email`, `display_name`, `avatar_url`, `updated_at` (`core/auth.tsx:304-313`). Owned by `core/auth.tsx`.
- `learner_profiles` - `user_id`, `display_name`, `level`; upserted `onConflict: "user_id"` (`api/useProfile.tsx:73-78`, `:104-111`). `useProfile` keeps the row in the account-scoped non-persisted `robin.profile` store (`api/useProfile.tsx:17`) and performs a one-time import of the legacy phone copy at `borel-store:robin.profile` when no row exists (`api/useProfile.tsx:69-86`, `api/profileImport.ts:3`).
- `practice_sessions` - `id`, `user_id`, `scenario_id`, `transcript` (JSON array of `Turn`), `debrief`, `summary`, `ended_at`, `started_at` (`api/useSessions.tsx:49-55`). One open session per user is found by `.is("ended_at", null)` (`:53`). The open session is shared through the non-persisted `robin.openSession` store (`:33`).
- `robin_memory` - `id`, `user_id`, `kind`, `content`, `created_at` (`api/useMemory.tsx:28-33`). Notes are shared through the non-persisted `robin.memory` store (`:12`).

Failed queries are translated by `plainError(error, "save" | "load")` into one plain sentence; Borel refusal codes (`wallet_empty`, `daily_allowance_used`, `cloud_paused`) map to neutral cloud messages (`core/db.ts:142-159`).

## Client construction

The neon-js client is built lazily (`native()`, `core/db.ts:674-683`). On native it uses a `SupabaseAuthAdapter` with a `borel-session` plugin that persists auth cookies in AsyncStorage so sign-in survives restarts (`core/db.ts:524-645`). In the browser preview it is built in external-provider mode with `getToken` returning a brokered handle (`core/db.ts:685-700`).

The exported `db` object is the client with `auth`, `storage`, `ai`, `account`, `moderation`, and `notify` attached (`core/db.ts:1970`).

## Authentication

- `AuthProvider` / `useAuth` live in `core/auth.tsx`. On mount it reads the stored session and subscribes to auth changes (`core/auth.tsx:349-380`).
- High-level functions: `signUp`, `signIn`, `signOut`, `sendPasswordReset`, `resetPassword`, `confirmEmail`, `updatePassword`, `resendConfirmation`, `deleteAccount`, `signInWithApple` (`core/auth.tsx:113-294`).
- User-facing error translation is `authErrorMessage` (`core/auth.tsx:59-93`).
- Prebuilt account UI: `SignInFlow`, `SignInSheet`, `RequireAccount`, `AccountPanel` (`core/auth.tsx:689`, `:906`, `:933`, `:961`). `PASSWORD_RESET_AVAILABLE` is `false`, so the "Forgot password" link is hidden (`core/auth.tsx:425`, `:885`). `APPLE_SIGN_IN_AVAILABLE` reads `EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE` from the environment (`:412`, see `.env.example`).
- Sign in with Apple runs `appleCall("/nonce")`, the native sheet, then `appleCall("/sign-in")` and `adoptSession` (`core/auth.tsx:271-294`, `core/db.ts:1944-1967`).

## AI

`db.ai` (`core/db.ts:1473-1646`) exposes:

- `models = { fast: "qwen3-next-80b-a3b-instruct", smart: "gemini-3-flash" }` (`:1475`).
- `chat({ model, messages, temperature, max_tokens, json })` - chat completions with an `AbortController` timeout of 75s (`:1478-1519`, `:1259-1290`). With `json: true` it appends a JSON-only instruction and parses the reply, retrying once on unreadable output (`:1324-1390`, `:1503-1515`).
- `transcribe({ audio, language, prompt })` - writes down speech; always uses `AI_AUDIO_MODEL = "gemini-3-flash"` (`:1525-1562`, `:174`). Audio is accepted as a recording object, a `{ recording }` result, or a data URL, and capped at 3 MB / 4 MB base64 (`:1197-1240`).
- `image(...)` and `editImage(...)` - image generation and editing; repeated identical prompts share one in-flight promise (`:1565-1645`, `:1471`).

Before any AI call that sends personal data, `askAiConsent` shows an Alert once per provider and remembers "Allow" in AsyncStorage under `borel.aiConsent.v1:` (`core/db.ts:171-262`).

### Robin agent

Robin's turn is assembled from pure, tested modules; only the port implementation touches `core/db`:

- `buildSystemPrompt` (`api/robinPrompt.ts:12-37`) builds the system prompt from scenario, level, name, memory notes, and recap. It sets the in-character role, level-adjusted complexity, inline-correction rule, 45-word cap, and the JSON tool protocol for `search_sessions`, `get_session`, and `list_recent_sessions`.
- `runSessionTool` (`api/robinTools.ts:79-126`) executes one tool call over the `SessionReader` port (`:13-16`): keyword search across up to 25 recent sessions returning up to 3 hits, single-session fetch with transcript excerpt and debrief summary, and recent listing capped at 5. Unknown tools and bad arguments return the plain sentence `"Robin could not look that up just now."` (`:24`).
- `runRobinTurn` (`api/robinAgent.ts:50-85`) loops chat plus tool results, capped at 3 tool rounds (`:22`). Tool output returns as `[tool result: <name>]` messages (`:60-63`); after the third round the model is instructed to reply (`:24`, `:64-66`). Bare `{ text }` replies without an `action` field are accepted (`:40-42`), and raw non-JSON text falls back to a plain reply (`:81-82`). `parseDebrief` (`:87-101`) caps debriefs at 5 mistakes, 3 tips, and 3 memory notes.
- `sessionReader` (`api/sessionReader.ts:22-46`) is the live `SessionReader`: it reads ended `practice_sessions` rows scoped to the user, resolving scenario titles via `scenarioById`.
- `useRobin` (`api/useRobin.tsx:31-65`) wires the pieces: `nextTurn` sends the system prompt plus transcript with `model: db.ai.models.fast` (`fast: "qwen3-next-80b-a3b-instruct"`, `core/db.ts:1475`), opening with `[The scene begins. Speak first, in character.]` on an empty transcript (`:56-58`). Shapes are unchanged: `{ text, complete, remember, error }` and `{ debrief, error }`.

The pure modules (`api/robinPrompt.ts:1-2`, `api/robinTools.ts:1`, `api/robinAgent.ts:1-2`) import `core/db` types with `import type` only; the runtime import lives in `api/sessionReader.ts:1` and `api/useRobin.tsx:2-3`.

## Storage

`db.storage.from(bucket)` provides `upload`, `getPublicUrl`, `createSignedUrl`, and `remove` (`core/db.ts:818-861`). Uploads are presigned, then PUT directly, optionally reporting progress through XHR. Limits are 25 MB for files and 200 MB for video (`core/db.ts:729-730`).

## Moderation, account deletion, notifications

- `db.moderation` implements report, block, unblock, hidden-item filtering (`visible`, `isHidden`), a report/block menu (`openMenu`), and a content check (`check`) (`core/db.ts:975-1113`). This supports App Store Guideline 1.2 (`:888-893`).
- `db.account.delete()` removes the account server-side (`core/db.ts:869-886`); `deleteAccount` in `core/auth.tsx:252-257` also signs the device out.
- `db.notify({ userIds, title, body, data })` links the device's push token to the signed-in user and sends targeted notifications (`core/db.ts:1678-1863`).

## Refusal handling

When Borel refuses a call (HTTP 402 with a `reason`), the client converts it into a neutral message for the user and, on owner surfaces only, shows a notice pointing at the Borel usage page (`core/db.ts:264-319`, `:655-672`). Released store builds never see billing state (`:51-62`, `:296-302`).
