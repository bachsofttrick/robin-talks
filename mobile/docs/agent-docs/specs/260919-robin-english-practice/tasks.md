# Tasks: Robin, an AI English practice app

Status: complete
Spec: spec.md

Conventions for every task: relative imports (`./`, `../`); user-facing errors are one plain sentence with a leading capital and terminal punctuation; `core/db.ts`, `core/auth.tsx`, and `core/legal.tsx` are Borel-managed and are never edited; `borel-store.js` is used as it is exported; commands run with Bun (`bun install`, `bun run typecheck`, `bun run test`, `bunx expo ...`), and both checks stay clean; no task runs a git command.

## Wave 1

- [x] T1: Test harness and catalog invariant (commit abc82b2)
  - Satisfies: AC-4
  - Files: package.json, api/scenarios.test.ts
  - Do: add the dev dependencies with `bunx expo install jest-expo jest @types/jest --dev`; add `"test": "jest"` to scripts and `"jest": { "preset": "jest-expo" }` to package.json. Write the catalog test: 6 to 8 scenarios, unique ids, every entry has a non-empty title, description, goal, and a level in Beginner / Intermediate / Advanced, and `scenarioById` finds an entry by id.
  - Tests: api/scenarios.test.ts
  - Done when: `bun run test` runs the catalog test green and `bun run typecheck` passes.

- [x] T2: One shared store for sessions and memory (commit 4b30c99)
  - Satisfies: AC-3, AC-15, AC-19
  - Files: api/store.ts (new), api/store.test.ts (new), api/useSessions.tsx, api/useMemory.tsx
  - Do: add `createAppStore<T>(key, initial)` wrapping `createStore` from `../borel-store`, exposing typed `use`, `useStatus`, `get`, `set`, `subscribe`, and `reset`. Convert `useSessions` to a module-scope `createAppStore<PracticeSession | null>("robin.openSession", null)` and `useMemory` to `createAppStore<MemoryNote[]>("robin.memory", [])`, both without persistence. Reset to the initial value when the signed-in user changes, then reload. `create` puts the returned row into the store so every screen sees the open session immediately; `saveTranscript` updates the stored transcript when the id matches; `finish` and `clearAll` clear the open session; `remember` reloads the list. Keep every exported name, type, and return field exactly as today.
  - Tests: api/store.test.ts (get and set, functional update, subscribe and unsubscribe, equal value does not notify, reset, the same key returns the same store)
  - Done when: `bun run test` and `bun run typecheck` pass, and no screen file needed a change.

- [x] T3: Robin prompt, tools, and agent loop (commit 7892665)
  - Satisfies: AC-10, AC-12, AC-13, AC-16, AC-17, AC-18
  - Files: api/robinPrompt.ts (new), api/robinTools.ts (new), api/robinAgent.ts (new), api/sessionReader.ts (new), api/useRobin.tsx, api/robinPrompt.test.ts (new), api/robinTools.test.ts (new), api/robinAgent.test.ts (new)
  - Do: move the system prompt into `buildSystemPrompt({ scenario, level, name, memory, recap })`, keeping today's persona, level, inline-correction, and no-greeting rules and adding the tool protocol from plan.md. Define the `SessionReader` port and `runSessionTool(reader, userId, name, args)` for `search_sessions`, `get_session`, and `list_recent_sessions`, with bounded plain-text results: search scans up to 25 recent ended sessions and returns up to 3 hits with id, scenario, date, and one excerpt; get returns the caller's own session with a bounded transcript excerpt and debrief summary; recent returns up to 5 sessions with summaries. Implement `runRobinTurn(messages, deps)`, with `deps.chat` and `deps.runTool` injected: parse the reply JSON, run at most three tool rounds, append each tool output as a user message, tell the model to reply on the final call, fall back to raw reply text when the JSON is unreadable, return a plain error sentence when there is no usable text at all, and return `{ text, complete, remember, error }`. Move debrief parsing into `parseDebrief(data)`. Implement `sessionReader.ts` over `db.from("practice_sessions")`, scoped with `.eq("user_id", user.id)` and ended sessions only. Rewire `useRobin` to take the user from `useAuth()`, build the prompt, and run the loop; keep `{ nextTurn, debrief }` and the `RobinReply` and `Debrief` types. Use `import type` for modules that pull in `core/db`.
  - Tests: api/robinPrompt.test.ts (level line, scenario role and goal, every memory item, "Nothing yet." when memory is empty, protocol and correction rules); api/robinTools.test.ts (search matches transcript, summary, and scenario title within the stated bounds; get returns null for an unknown id; recent respects the limit; unknown tool and bad args return a plain sentence); api/robinAgent.test.ts (tool then reply round trip calls the runner once and carries the result back, rounds are capped with a final reply instruction, unreadable JSON falls back to raw text, no usable text returns a plain sentence, complete and remember pass through); debrief parsing (fields kept, malformed entries filtered, caps at 5 mistakes and 3 tips)
  - Done when: `bun run test` and `bun run typecheck` pass.

- [x] T4: Voice activity detection and recorder wiring (commit 614938a)
  - Satisfies: AC-7, AC-20
  - Files: borel-systemui.js, screens/Session/voiceActivity.ts (new), screens/Session/voiceActivity.test.ts (new), screens/Session/useTurnRecorder.ts (new)
  - Do: in `createRecorder`, pass `isMeteringEnabled: true` for the HIGH_QUALITY preset and the low preset, with a comment saying why, so `getRecordingStatus().metering` carries a real level. Add the pure `nextVoiceActivity(state, sample, options)` detector with the defaults from plan.md and a `done` reason of `"silence"` or `"max"`. Add `useTurnRecorder({ onTurnEnd })` wrapping `getPermissionStatus`, `requestPermission`, `startRecording({ maxDurationMs: 30000 })`, a 150 ms poll of `getRecordingStatus`, `stopRecording`, and `cancelRecording`; it exposes `{ recording, denied, start, stop, cancel, enableMic }` and calls `onTurnEnd` once per turn.
  - Tests: screens/Session/voiceActivity.test.ts (no speech, speech then 1.5 s of quiet ends the turn, brief dips do not, below-threshold noise never counts, the 30 s ceiling ends it, a missing level counts as silence)
  - Done when: `bun run test` and `bun run typecheck` pass.

## Wave 2

- [x] T5: Account-scoped profile with a one-time legacy import (commit baf5617)
  - Satisfies: AC-2, AC-3
  - Files: api/profileImport.ts (new), api/profileImport.test.ts (new), api/useProfile.tsx
  - Do: replace the persisted `robin.profile` store with `createAppStore<Profile>("robin.profile", EMPTY)` and no persistence; reset it when the signed-in user changes and reload from `learner_profiles`. Add `parseLegacyProfile(raw)` handling a raw object or a `{ v, data }` envelope, trimming the name and accepting only the three levels. After a successful load for a user with no row, read `borel-store:robin.profile` with AsyncStorage, parse it, upsert it into `learner_profiles`, set the store, and remove the key; when a row already exists, remove the key. Keep `{ data, loading, error, reload, save }` and the `plainError` handling.
  - Tests: api/profileImport.test.ts (valid raw object, versioned envelope, empty name rejected, unknown level rejected, malformed JSON returns null)
  - Done when: `bun run test` and `bun run typecheck` pass.

- [x] T6: Session screen voice lifecycle and final turn (commit 59c1115)
  - Satisfies: AC-6, AC-7, AC-8, AC-9, AC-11, AC-17, AC-20
  - Files: screens/Session/index.tsx
  - Do: use `useTurnRecorder`; `say` returns the `speak` promise and `advance` awaits it before opening the mic, so the microphone never records Robin. When the detector ends a turn, transcribe and send it exactly as the manual stop does. Keep the manual stop, the typing switch, the permission-denied notice, the empty-transcript notice with a reopened mic, the retryable error notice, the replay control, and the debrief view. Stop or cancel recording when switching to typing, when leaving the screen, and before a send. After transcription, delete the temporary recording file with `expo-file-system/legacy` `deleteAsync(uri, { idempotent: true })` in a try/catch. When Robin's reply is `complete`, let the final line finish playing before `finish` runs, and do not open the mic.
  - Tests: none (screen wiring; its decisions are the detector in voiceActivity.ts and the loop in robinAgent.ts, both unit-tested, and Phase 5 drives the flow)
  - Done when: `bun run typecheck` passes and the screen compiles with no change to the `useRobin` or `useSessions` shapes.

- [x] T7: Catalog entry completeness (commit cd3e681)
  - Satisfies: AC-4, AC-5
  - Files: screens/Practice/index.tsx
  - Do: the featured card shows the scenario's one-line description, its level tag, and its goal, so every entry in the home catalog carries title, description, level tag, and goal. Starting any entry stays unrestricted by the user's level.
  - Tests: none (presentational; catalog data is covered by api/scenarios.test.ts)
  - Done when: `bun run typecheck` passes and every featured and listed entry shows all four fields in the rendered screen.

## Wave 3

- [x] T8: Root navigation gates and launch resume (commit 770a229)
  - Satisfies: AC-2, AC-14
  - Files: navigation/rootRoute.ts (new), navigation/rootRoute.test.ts (new), navigation/RootNavigator.tsx
  - Do: add the pure `rootRoute(input)` decision with the exact input and output contract in plan.md: loading while auth is loading or, for a signed-in user, the profile or open-session read is in flight; a retryable error state when the profile read failed and no onboarded profile exists; Onboarding when signed in and not onboarded; otherwise Tabs, with `initialTab` Session when an unfinished session exists and Practice otherwise. Wire `RootNavigator` to it using `useAuth`, `useProfile`, and `useSessions`, with a small centered spinner for loading and a `Notice` with retry for the error state. Ended sessions stay filtered by the existing `.is("ended_at", null)` query and never resume.
  - Tests: navigation/rootRoute.test.ts (each branch, including the error branch and the Session initial tab)
  - Done when: `bun run test` and `bun run typecheck` pass.

## Wave 4

- [x] T9: Acceptance sweep (no code change, evidence only)
  - Satisfies: AC-1, AC-5, AC-9, AC-12
  - Files: none
  - Do: with all earlier tasks merged, run `bun run typecheck`, `bun run test`, and `bunx expo export --platform web` (the closest thing to a build this project has). Check that `learner_profiles`, `practice_sessions`, and `robin_memory` load for the signed-in user, since a query error there means the table or its own-rows policy is missing in Borel. Then drive what this environment can run to check the untouched paths: registration and sign-in errors (duplicate email, short password, wrong credentials), starting any scenario at any level, the transcript with per-turn replay, and the debrief contents. Record the exact commands and observations.
  - Tests: none (this is the evidence pass; Phase 5 re-verifies)
  - Done when: every listed path has recorded evidence or a stated limitation.

## Coverage

- AC-1: T9
- AC-2: T5, T8
- AC-3: T2, T5
- AC-4: T1, T7
- AC-5: T7, T9
- AC-6: T6
- AC-7: T4, T6
- AC-8: T6
- AC-9: T6, T9
- AC-10: T3
- AC-11: T6
- AC-12: T3, T9
- AC-13: T3
- AC-14: T8
- AC-15: T2
- AC-16: T3
- AC-17: T3, T6
- AC-18: T3
- AC-19: T2
- AC-20: T4, T6
