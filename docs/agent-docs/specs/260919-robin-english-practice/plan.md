# Plan: Robin, an AI English practice app

Status: approved
Spec: spec.md

## Approach

Keep the exported architecture. This is a client-only Expo app: `db.from(...)` reaches this app's Postgres through the Borel proxy under per-user RLS, `db.ai.chat` and `db.ai.transcribe` are the AI, and `borel-systemui.js` backs speech, recording, and permissions on the device. The work closes the distance between the app Borel generated and the approved spec. Nothing is rebuilt as a server, and the server-side data model from the earlier draft plan is dropped.

Four moves:

1. One shared store per domain. `useSessions` and `useMemory` hold per-screen `useState`, which the Borel export report flagged: a session written in Session or a delete in Settings is invisible to the other screens. Both hooks move to a module-scope store (`createStore` from `borel-store.js`) and mutate it on every write, keeping their return shapes so the screens need no change. `learner_profiles` stays the source of truth for the profile: the device-persisted `robin.profile` store goes away, the profile re-reads for each signed-in user, and a legacy local value is imported into the account once.
2. Robin gets tools. `db.ai.chat` exposes no provider function calling, so the tools are emulated with one strict JSON protocol inside a small agent loop. The model answers either a reply or a tool request; the loop runs the tool against the signed-in user's own `practice_sessions` rows, appends the result, and calls again, at most three rounds. `search_sessions`, `get_session`, and `list_recent_sessions` live in one module and only the loop invokes them.
3. Voice turns end on a pause. The microphone opens only after `speak()` resolves. Recording already runs through `borel-systemui`, but metering was off, so a pause was invisible; `createRecorder` enables `isMeteringEnabled`. A hook polls `getRecordingStatus().metering` and a pure detector ends the turn after about 1.5 s below the silence level once speech was heard, with the manual stop and a 30 s ceiling as fallbacks.
4. The remaining gaps close: every catalog entry shows level, description, and goal; the app opens the unfinished session on launch; the onboarding gate waits for the profile to load and survives a load failure; the last Robin line finishes playing before the debrief replaces the screen; the temporary recording file is deleted after transcription.

Commands run with Bun, matching the `bun.lock` already in the repo: `bun install`, `bun run typecheck`, `bun run test`, and `bunx expo ...` for the Expo CLI.

AC-16 note: the spec's tools run in the app's own agent loop, because this project has no server. The executors are module-private and only the loop calls them; no screen, button, or exported API can invoke one, which is the protection the criterion asks for. I will confirm this interpretation at plan review.

Resolved open questions from spec.md: Q-1 is settled by the exported project: Borel's Postgres via `db.from`, `db.ai.chat` and `db.ai.transcribe` for the agent and speech-to-text, and `expo-speech` through `borel-systemui.speak` for text-to-speech. Q-2 stays a prompt decision: a significant error is one that changes meaning or blocks understanding; the prompt folds a short correction into the reply and continues, with no numeric threshold.

## Affected Code

- `api/store.ts` (new): typed wrapper over `createStore`, so the three hooks share one pattern. Serves AC-3, AC-15, AC-19.
- `api/useSessions.tsx`: module-scope store for the open session; every write updates it; return shape unchanged. Serves AC-14, AC-15, AC-19 and the Borel report.
- `api/useMemory.tsx`: module-scope store for memory notes; return shape unchanged. Serves AC-3, AC-17, AC-18, AC-19 and the Borel report.
- `api/useProfile.tsx`, `api/profileImport.ts` (new): account-scoped profile, no persisted copy, one-time legacy import. Serves AC-2, AC-3 and the Borel report.
- `api/robinPrompt.ts` (new): system prompt with persona, level rules, memory, and the tool protocol. Serves AC-6, AC-10, AC-13, AC-16.
- `api/robinTools.ts` (new): tool schemas and executor over a `SessionReader` port. Serves AC-16.
- `api/robinAgent.ts` (new): the JSON tool loop and debrief parsing. Serves AC-10, AC-12, AC-16, AC-17.
- `api/sessionReader.ts` (new): `db.from("practice_sessions")` implementation of the port, scoped to the signed-in user. Serves AC-16, AC-19.
- `api/useRobin.tsx`: wires the prompt, reader, and loop; `nextTurn` and `debrief` shapes unchanged. Serves AC-10, AC-12, AC-13, AC-16, AC-17, AC-18.
- `borel-systemui.js`: enable metering in `createRecorder`. Serves AC-7.
- `screens/Session/voiceActivity.ts` (new): pure pause detector. Serves AC-7.
- `screens/Session/useTurnRecorder.ts` (new): recorder lifecycle and level polling over `borel-systemui`. Serves AC-7, AC-20.
- `screens/Session/index.tsx`: await speech before opening the mic, detector-driven stop, cancel on switch and unmount, delete the temp recording after transcription, finish after the final line. Serves AC-6, AC-7, AC-8, AC-9, AC-11, AC-17, AC-20.
- `screens/Practice/index.tsx`: every catalog entry shows title, description, level tag, and goal. Serves AC-4, AC-5.
- `navigation/rootRoute.ts` (new), `navigation/RootNavigator.tsx`: load gate, onboarding gate, open-session initial tab. Serves AC-2, AC-14.
- `package.json` plus the test files below: jest-expo harness. Serves AC-4 and every test-bearing task.
- `api/store.test.ts`, `api/profileImport.test.ts`, `api/robinPrompt.test.ts`, `api/robinTools.test.ts`, `api/robinAgent.test.ts`, `screens/Session/voiceActivity.test.ts`, `navigation/rootRoute.test.ts`, `api/scenarios.test.ts` (new): unit tests for the pure modules.
- Not touched: `core/db.ts`, `core/auth.tsx`, `core/legal.tsx` (Borel-managed), `borel-store.js`.

## Data Model and Contracts

Tables (already in this app's Borel cloud; this repo does not define the schema, so a missing table or policy is fixed in Borel, not here):

- `learner_profiles`: `user_id` (text, one row per user, `default auth.user_id()`), `display_name`, `level` in Beginner / Intermediate / Advanced.
- `practice_sessions`: `id`, `user_id`, `scenario_id`, `transcript` (JSON array of `Turn`), `debrief` (JSON object), `summary`, `ended_at`, `started_at`.
- `robin_memory`: `id`, `user_id`, `kind`, `content`, `created_at`.

All three need own-rows RLS policies (`user_id = auth.user_id()`), and every query also scopes with an explicit `.eq("user_id", ...)`.

Stores:

- `robin.profile` = `{ displayName: string; level: Level; onboarded: boolean }`, not persisted.
- `robin.openSession` = `PracticeSession | null`, not persisted.
- `robin.memory` = `MemoryNote[]`, not persisted.

Agent protocol (one JSON object per model turn, `json: true`):

- Reply: `{ "action": "reply", "text": string, "complete": boolean, "remember": string | null }`
- Tool: `{ "action": "tool", "tool": "search_sessions" | "get_session" | "list_recent_sessions", "args": object }`
- The loop appends `[tool result: <name>]` plus the tool output as a user message and calls again. Three tool rounds maximum; on the next call the model is told to reply. Unreadable JSON with raw text falls back to that text as the reply; otherwise the turn fails with the existing plain sentence.

Tools (`SessionReader` port: `search(userId, query)`, `get(userId, id)`, `recent(userId, limit)`):

- `search_sessions { query }`: up to 25 recent ended sessions scanned for a case-insensitive match in transcript, summary, or scenario title; up to 3 hits with id, scenario, date, and one excerpt.
- `get_session { id }`: the caller's own session by id, transcript excerpt and debrief summary, bounded in size.
- `list_recent_sessions { limit }`: up to 5 recent ended sessions with id, scenario, date, and summary.

Voice detector: `nextVoiceActivity(state, { level, deltaMs }, options)` with defaults `SPEECH_LEVEL = 0.4`, `SILENCE_LEVEL = 0.25`, `MIN_SPEECH_MS = 300`, `SILENCE_MS = 1500`, `MAX_TURN_MS = 30000`. It returns the next state plus `done` and `reason` (`"silence"` or `"max"`). Levels are the 0..1 values `getRecordingStatus().metering` reports.

Root routing: the pure `rootRoute(input)` takes `{ authLoading, signedIn, profileLoading, profileError, profileDetail, onboarded, sessionLoading, hasOpenSession }` and returns one of `{ kind: "loading" }`, `{ kind: "profileError", message, detail }`, `{ kind: "onboarding" }`, or `{ kind: "tabs", initialTab: "Practice" | "Session" }`. Signed-in users wait for the profile and open-session reads; a failed profile read shows the retryable error instead of trapping the user in onboarding; a signed-out user gets Tabs, where the screens show the account card.

## Libraries

- `expo-audio` ~57.0.4 (used through `borel-systemui.js`): recording; `isMeteringEnabled` turns on the level `getRecordingStatus()` reads.
- `expo-speech` ~57.0.2 (through `borel-systemui.speak`): Robin's voice; its returned promise is what the mic waits on.
- `@neondatabase/neon-js` ^0.7.0-beta (through `core/db.ts`): `db.from` queries, `db.ai.chat`, `db.ai.transcribe`.
- `borel-store.js` `createStore`: shared state with no Provider to mount; persistence stays off because Postgres is the source of truth.
- `expo-file-system` ~57.0.6 (`expo-file-system/legacy`): best-effort delete of the temporary recording after transcription.
- `jest-expo` 57.0.5 plus `jest` and `@types/jest` (new, dev only): unit tests for pure modules, added with `bunx expo install`.

## Risks

- The tables or their RLS policies may not exist or may not be account-scoped: every `db.from` call fails and the screen falls back to the plain error sentence. Mitigation: Phase 5 checks each table with a signed-in user; anything missing is added in Borel, outside this repo. The code always scopes by `user_id` as well.
- The fast model may not follow the JSON tool protocol. Mitigation: one object with two shapes, the prompt restates it, the loop caps tool rounds, and an unreadable reply falls back to its raw text so a turn never dies on protocol alone.
- Silence detection may misfire in a noisy room or where metering is not reported. Mitigation: a minimum speech window must pass before silence counts, the manual stop always works, the 30 s ceiling ends a runaway recording, and an empty transcription reopens the mic with the existing notice.
- `borel-systemui.js` is regenerated if the app is updated inside Borel, which would drop the metering flag. Mitigation: the edit is one property per preset plus a comment, and the symptom (manual stop only) is obvious if it regresses.
- Adding jest-expo changes `package.json` and updates `bun.lock`. Mitigation: versions matched to SDK 57 are installed with `bunx expo install`; if the harness cannot run in this environment the failure is reported and Phase 5 falls back to typecheck and the exported web bundle.
- AC-1's "password shorter than 8 characters, showing a clear error" is implemented by Borel's `core/auth.tsx` as a disabled submit button with the visible "At least 8 characters." hint. The file is regenerated, so it is not hand-edited; duplicate email and wrong credentials already map to plain sentences in `authErrorMessage`.
- Borel's export report warned that `core/index.tsx` does not resolve `./auth`; in this tree `core/auth.tsx` exists and `tsc --noEmit` reports only the `createStore<Profile>` type-argument error that T5 removes.
- Module-scope stores outlive sign-out. Mitigation: every store resets when the signed-in user changes, so one account never sees another's data on a shared device.
