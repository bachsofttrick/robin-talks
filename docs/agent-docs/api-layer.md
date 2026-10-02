# API Layer

`src/lib/api/` holds the domain hooks and the static scenario catalog. Screens
import from the barrel (`src/lib/api/index.tsx`); none of these hooks are
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
  sets `onboarded: true`, no row sets `EMPTY`.
- `save(displayName, level)` upserts `learner_profiles` on conflict `user_id`,
  then updates the store.

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

### `useMemory` (`src/lib/api/useMemory.tsx`)

- `MemoryNote = { id: string; kind: string; content: string }`.
- `reload` reads `robin_memory` (id, kind, content) newest first, limit 40.
- `remember(kind, content)` inserts a row (no-op on empty content).
- `clearAll()` deletes all of the user's memory rows.
- Kinds used by the app: `"fact"` for facts Robin volunteers mid-conversation, and
  `"profile"` for debrief memory notes (`src/screens/Session/index.tsx:141,203`).

### `useRobin` (`src/lib/api/useRobin.tsx`)

The AI surface for the session loop.

- `RobinReply = { text: string | null; complete: boolean; remember: string | null; error: string | null }`
- `Debrief = { summary: string; mistakes: { said: string; better: string }[]; tips: string[]; memory: string[] }`
- `nextTurn(args)` builds messages from a `systemPrompt` (persona from the
  scenario, level-appropriate language rules, memory notes, recent-debrief recap,
  and a JSON reply protocol capped at 45 words), maps the transcript to
  user/assistant roles, and calls `db.ai.chat({ messages, json: true, model:
  db.ai.models.fast })`. On an empty transcript it appends a first-speak cue.
  Returns the parsed `text`, `complete`, and `remember` fields.
- `debrief(scenario, level, transcript)` scripts the transcript and calls
  `db.ai.chat({ json: true, model: db.ai.models.smart })`, then validates and
  clamps the result: up to 5 mistakes, 3 tips, 3 memory notes.

Note: `db.ai.models.fast` and `db.ai.models.smart` are both `openai/gpt-6-luna`
in the current code (`src/lib/core/db/ai.ts:419`).

## Database tables used

The schema lives on Borel's Postgres; there are no migration files in this
repository. Tables referenced by the app, each scoped to the signed-in user
through row-level security:

| Table | Columns read/written | Where |
|---|---|---|
| `profiles` | `id`, `email`, `display_name`, `avatar_url`, `updated_at` | `src/lib/core/auth/actions.ts:193-209` (best-effort sync on sign-in) |
| `learner_profiles` | `user_id`, `display_name`, `level` | `src/lib/api/useProfile.tsx` |
| `practice_sessions` | `id`, `user_id`, `scenario_id`, `transcript`, `debrief`, `summary`, `started_at`, `ended_at` | `src/lib/api/useSessions.tsx` |
| `robin_memory` | `id`, `user_id`, `kind`, `content`, `created_at` | `src/lib/api/useMemory.tsx` |

`storage.from(bucket)` is available for files (`src/lib/core/db/storage.ts`) and
`avatars` appears only in that file's usage comment; the app stores no files
today.

## Store mechanism

Hooks that need shared or persisted state use `createStore` from the root
`borel-store.js` (a module singleton read with React's `useSyncExternalStore`; no
Provider). `useProfile` is the only current user; `useSessions` and `useMemory`
keep their state in the hook instance. The naming convention for store keys is
`robin.<area>` (for example `robin.profile`).
