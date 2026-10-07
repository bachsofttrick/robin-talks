# API Layer

Source paths are relative to `apps/mobile/` unless noted.

`src/lib/api/` holds the domain hooks and the static scenario catalog. The
folder has a barrel (`src/lib/api/index.tsx`), and screens and the navigator
import the individual modules instead (`../../lib/api/useSessions`), so a new
hook needs adding to both the barrel and its own file. None of these hooks are
Borel-managed.

## Scenarios (`src/lib/api/scenarios.ts`)

Static data only. Each `Scenario` has `id`, `title`, `description`, `level`
(`"Beginner" | "Intermediate" | "Advanced"`), `goal`, `robinRole`, and `setting`.
Eight scenarios ship: coffee, directions, pharmacy (Beginner); checkin, smalltalk,
return (Intermediate); interview, complaint (Advanced). `scenarioById(id)` looks
one up.

## Hook contract

Every hook returns `{ data, loading, error, ...actions }` and routes database
failures through `plainError(error, "save" | "load")` from `src/lib/core/db`.
Hooks read the signed-in user from `useAuth()` and re-run when it changes.

`useProfile`, `useSessions`, and `useMemory` call the typed backend data client in
`src/lib/core/db/data.ts` on both surfaces. Native replays the better-auth session
cookie as a `Cookie` header; the browser sends its cookie with
`credentials: "include"`. The data client exports one function per endpoint:
`getProfile`,
`saveProfile`, `createSession`, `getOpenSession`, `getRecentSessions`,
`getSession`, `updateSession`, `deleteAllSessions`, `listMemory`, `addMemory`,
`deleteAllMemory`, and `upsertProfile`.

### `useProfile` (`src/lib/api/useProfile.tsx`)

- `Profile = { displayName: string; level: Level; onboarded: boolean }`, default
  `{ displayName: "", level: "Beginner", onboarded: false }`.
- Backed by `createStore("robin.profile", EMPTY, { persist: true })`, so the
  value survives restarts and is shared across screens.
- `reload` reads `learner_profiles` (`display_name`, `level`) for the user through
  `getProfile()` (`GET /api/data/profile`). A row
  sets `onboarded: true`, no row sets `EMPTY`, and a signed-out read sets `EMPTY`.
  A failed read reports through `error` and leaves the store untouched, so the
  navigator sees whatever the last successful read left there.
- `save(displayName, level)` upserts `learner_profiles` on conflict `user_id`
  (via `saveProfile()` -> `PUT /api/data/profile`), then updates the store.
- The returned `error` merges the hook's own with the store's own status error
  (`profileStore.useStatus()`), so a hydration failure surfaces too.

### `useSessions` (`src/lib/api/useSessions.tsx`)

- `Turn = { role: "robin" | "user"; text: string }`
- `PracticeSession = { id, scenario_id, transcript: Turn[], debrief: string | null, ended_at, started_at, summary }`
- Actions (`practice_sessions`, `/api/data/sessions/*`): `reload` (the
  open session, `GET /sessions/open`), `create(scenarioId)` (`POST /sessions`,
  inserts with an empty transcript and returns the id), `fetchOne(id)` (`GET
  /sessions/:id`), `saveTranscript(id, transcript)` and `finish(id, transcript,
  debrief, summary)` (`PATCH /sessions/:id`, the latter sets `ended_at`),
  `recent()` (`GET /sessions/recent`, five ended sessions with debriefs, for the
  recap), and `clearAll()` (`DELETE /sessions`).
- `asSession` coerces a raw row into `PracticeSession`, defaulting a non-array
  transcript to `[]`.
- `reload` clears `open` when there is no user; `clearAll` clears it too.

### `useMemory` (`src/lib/api/useMemory.tsx`)

- `MemoryNote = { id: string; kind: string; content: string }`.
- `reload` reads `robin_memory` (id, kind, content) newest first, limit 40 through
  `listMemory()` (`GET /api/data/memory`).
- `remember(kind, content)` inserts a row (no-op on empty content) through
  `addMemory()` (`POST /api/data/memory`).
- `clearAll()` deletes all of the user's memory rows and empties `data` through
  `deleteAllMemory()` (`DELETE /api/data/memory`).
- `reload` empties `data` when there is no user.
- Kinds used by the app: `"fact"` for facts Robin volunteers mid-conversation, and
  `"profile"` for debrief memory notes (`src/screens/Session/index.tsx:183,218`).

### `useRobin` (`src/lib/api/useRobin.tsx`)

The AI surface for the session loop.

- `RobinReply = { text: string | null; complete: boolean; remember: string | null; error: string | null }`
- `Debrief = { summary: string; mistakes: { said: string; better: string }[]; tips: string[]; memory: string[] }`
- `nextTurn(args)` builds messages from a file-local `systemPrompt` (persona from
  the scenario, level-appropriate language rules, memory notes, and a recent
  recap), maps the transcript to user/assistant roles, and calls
  `db.ai.chat({ messages, jsonSchema: TURN_SCHEMA, model: db.ai.models.fast })`.
  On an empty transcript it appends a first-speak cue. Returns the parsed
  `text`, `complete`, and `remember` fields, and `error` when the reply carries
  no `text` string.
- `debrief(scenario, level, transcript)` scripts the transcript and calls
  `db.ai.chat({ jsonSchema: DEBRIEF_SCHEMA, model: db.ai.models.smart })`, then
  validates and clamps the result: up to 5 mistakes, 3 tips, 3 memory notes.
- `TURN_SCHEMA` and `DEBRIEF_SCHEMA` are `AiJsonSchema` values from
  `src/lib/core/db`. Every property is required and `additionalProperties` is
  closed so OpenAI's strict structured-output mode accepts them; optional values
  are unions with `null`, as `remember` is.

`db.ai` is the thin client in `src/lib/core/db/ai.ts` (see
[backend-and-ai.md](backend-and-ai.md)): the call POSTs `{ model, messages,
temperature, max_tokens, jsonSchema }` to the backend's `/api/ai/chat`, and the
reply shape is unchanged. The schemas stay client-side; the backend turns them
into OpenRouter's `response_format`.

Note: `db.ai.models.fast` and `db.ai.models.smart` are both `openai/gpt-6-luna`
in the current code (`src/lib/core/db/ai.ts:283`).

## Database tables used

The four tables live in the backend's Neon Postgres, created by
`apps/backend/drizzle/0001_complete_silver_fox.sql`, and are scoped to the session
user by the `/api/data/*` router rather than row-level security. Tables referenced
by the app:

| Table | Columns read/written | Where |
|---|---|---|
| `profiles` | `id`, `email`, `display_name`, `avatar_url`, `updated_at` | `syncProfile` in `src/lib/core/auth/actions.ts` (best-effort sync on sign-in; `PUT /api/data/profiles`) |
| `learner_profiles` | `user_id`, `display_name`, `level` | `src/lib/api/useProfile.tsx` (`GET`/`PUT /api/data/profile`) |
| `practice_sessions` | `id`, `user_id`, `scenario_id`, `transcript`, `debrief`, `summary`, `started_at`, `ended_at` | `src/lib/api/useSessions.tsx` (`/api/data/sessions/*`) |
| `robin_memory` | `id`, `user_id`, `kind`, `content`, `created_at` | `src/lib/api/useMemory.tsx` (`GET`/`POST`/`DELETE /api/data/memory`) |

`storage.from(bucket)` is available for files (`src/lib/core/db/storage.ts`) and
`avatars` appears only in that file's usage comment; the app stores no files
today.

## Store mechanism

Hooks that need shared or persisted state use `createStore` from
`src/lib/core/borel/borel-store.js` (a module singleton read with React's
`useSyncExternalStore`; no Provider). `useProfile` is the only current user;
`useSessions` and `useMemory` keep their state in the hook instance. The naming
convention for store keys is `robin.<area>` (for example `robin.profile`).
