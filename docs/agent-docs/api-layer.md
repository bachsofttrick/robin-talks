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

### `useProfile` (`src/lib/api/useProfile.tsx`)

- `Profile = { displayName: string; level: Level; onboarded: boolean }`, default
  `{ displayName: "", level: "Beginner", onboarded: false }`.
- Backed by `createStore("robin.profile", EMPTY, { persist: true })`, so the
  value survives restarts and is shared across screens.
- `reload` reads `learner_profiles` (`display_name`, `level`) for the user; a row
  sets `onboarded: true`, no row sets `EMPTY`, and a signed-out read sets `EMPTY`.
  A failed read reports through `error` and leaves the store untouched, so the
  navigator sees whatever the last successful read left there.
- `save(displayName, level)` upserts `learner_profiles` on conflict `user_id`,
  then updates the store.
- The returned `error` merges the hook's own with the store's own status error
  (`profileStore.useStatus()`), so a hydration failure surfaces too.

### `useSessions` (`src/lib/api/useSessions.tsx`)

- `Turn = { role: "robin" | "user"; text: string }`
- `PracticeSession = { id, scenario_id, transcript: Turn[], debrief: string | null, ended_at, started_at, summary }`
- Actions: `reload` (the open session, `ended_at is null`, newest first, limit 1),
  `create(scenarioId)` (inserts with an empty transcript and returns the id),
  `fetchOne(id)`, `saveTranscript(id, transcript)`, `finish(id, transcript,
  debrief, summary)` (sets `ended_at`), `recent()` (five ended sessions with
  debriefs, for the recap), and `clearAll()`.
- `asSession` coerces a raw row into `PracticeSession`, defaulting a non-array
  transcript to `[]`.
- `reload` clears `open` when there is no user; `clearAll` clears it too.

### `useMemory` (`src/lib/api/useMemory.tsx`)

- `MemoryNote = { id: string; kind: string; content: string }`.
- `reload` reads `robin_memory` (id, kind, content) newest first, limit 40.
- `remember(kind, content)` inserts a row (no-op on empty content).
- `clearAll()` deletes all of the user's memory rows and empties `data`.
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

Note: `db.ai.models.fast` and `db.ai.models.smart` are both `openai/gpt-6-luna`
in the current code (`src/lib/core/db/ai.ts:429`).

## Database tables used

The schema lives on Borel's Postgres; there are no migration files in this
repository. Tables referenced by the app, each scoped to the signed-in user
through row-level security:

| Table | Columns read/written | Where |
|---|---|---|
| `profiles` | `id`, `email`, `display_name`, `avatar_url`, `updated_at` | `src/lib/core/auth/actions.ts:193-210` (best-effort sync on sign-in) |
| `learner_profiles` | `user_id`, `display_name`, `level` | `src/lib/api/useProfile.tsx` |
| `practice_sessions` | `id`, `user_id`, `scenario_id`, `transcript`, `debrief`, `summary`, `started_at`, `ended_at` | `src/lib/api/useSessions.tsx` |
| `robin_memory` | `id`, `user_id`, `kind`, `content`, `created_at` | `src/lib/api/useMemory.tsx` |

`storage.from(bucket)` is available for files (`src/lib/core/db/storage.ts`) and
`avatars` appears only in that file's usage comment; the app stores no files
today.

## Store mechanism

Hooks that need shared or persisted state use `createStore` from
`src/lib/core/borel/borel-store.js` (a module singleton read with React's
`useSyncExternalStore`; no Provider). `useProfile` is the only current user;
`useSessions` and `useMemory` keep their state in the hook instance. The naming
convention for store keys is `robin.<area>` (for example `robin.profile`).
