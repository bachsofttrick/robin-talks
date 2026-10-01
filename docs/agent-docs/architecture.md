# Architecture

Robin Talks is a client-only Expo React Native app. There is no server, build step, or API layer inside this repository: all persistence, authentication, AI, and file storage calls go to the Borel cloud proxy at `https://api.borel.one/api/proxy/<your-app-id>/...`, defined as constants in `src/lib/core/db.ts:16-24`.

## Component tree

`expo-entry.js` registers the root component with Expo and wraps the app in `SafeAreaProvider` (`expo-entry.js:15-19`). The app root is `index.tsx`, which composes providers in a fixed order (`index.tsx:14-27`):

1. `ErrorHandler` - a React error boundary (`src/lib/ui/ErrorHandler/index.tsx`).
2. `StatusBar` - dark style (`expo-status-bar`).
3. `AppFonts` - loads Lora and Manrope, painting the page colour until ready (`src/lib/ui/fonts.tsx:18-22`).
4. `CoreProviders` - currently just wraps children in `AuthProvider` (`src/lib/core/index.tsx:4-6`).
5. `NavigationContainer` - React Navigation with the app theme (`src/navigation/NavigationContainer.tsx`).
6. `RootNavigator` - decides Onboarding vs. the tab navigator (`src/navigation/RootNavigator.tsx`).

## Root navigation decision

The decision is pure and tested in `src/navigation/rootRoute.ts:23-31` (`rootRoute(input)`), and `RootNavigator` renders its result (`src/navigation/RootNavigator.tsx:66-75`). Signed-out users land on Tabs (Practice first) where screens show the account card; signed-in users wait on `authLoading`, `profileLoading`, or `sessionLoading` with a spinner (`:77-83`). A failed profile read with no onboarded profile renders a `Notice` with retry via `profile.reload` instead of trapping the user in onboarding (`:85-91`). Signed-in but not onboarded users get the `Onboarding` stack screen (`:93-99`); otherwise Tabs render with `initialTab` set to `Session` when an open session exists, else `Practice` (`:101-105`). The tab navigator has three screens: `Practice`, `Session`, and `Settings` (`src/navigation/RootNavigator.tsx:39-55`). No `headerShown` headers are used; the tab bar options come from `useTabBarOptions` (`src/lib/ui/TabBar.tsx`).

## Data flow

Screens never call `src/lib/core/db.ts` directly for domain data; they use hooks in `src/lib/api/` that combine `db.from(table)`, `useAuth()`, and local state.

- `useProfile` (`src/lib/api/useProfile.tsx`) reads and upserts the `learner_profiles` table, keyed by `user_id`, and mirrors the result into the account-scoped module-scope store `robin.profile` (`src/lib/api/useProfile.tsx:17`). The store holds no persisted copy; on first load with no row, it performs a one-time import of the phone copy saved by older builds under `borel-store:robin.profile`, upserts it, and deletes the phone copy (`src/lib/api/useProfile.tsx:69-86`, `src/lib/api/profileImport.ts:3`, `:25-48`).
- `useSessions` (`src/lib/api/useSessions.tsx`) owns `practice_sessions` through the module-scope shared store `robin.openSession` (`src/lib/api/useSessions.tsx:33`): it finds the single open session, creates one, saves transcripts, finishes it, lists the five most recent ended sessions, and clears all rows for the user. The store is not persisted; it resets on account change (`:65-72`).
- `useMemory` (`src/lib/api/useMemory.tsx`) owns `robin_memory` through the module-scope shared store `robin.memory` (`src/lib/api/useMemory.tsx:12`): lists up to 40 notes, inserts new ones, and clears all. The store is not persisted; it resets on account change (`:42-49`).
- `useRobin` (`src/lib/api/useRobin.tsx`) is stateless. `nextTurn` builds the system prompt via `buildSystemPrompt` and runs the tool loop via `runRobinTurn` over the `sessionReader` port (`src/lib/api/useRobin.tsx:31-65`); `debrief` calls `db.ai.chat` and parses the result with `parseDebrief` (`:67-90`). Shapes are unchanged: `{ text, complete, remember, error }` and `{ debrief, error }`.

All three shared stores are created with the typed `createAppStore` wrapper in `src/lib/api/store.ts:21-42`, which wraps `borel-store` `createStore` and returns the same store per key.

The `src/lib/api/index.tsx` barrel re-exports these hooks, the `SCENARIOS` catalog, and their types (`src/lib/api/index.tsx:1-10`).

## Session lifecycle

The full loop lives in `src/screens/Session/index.tsx`:

1. The screen receives `sessionId` and `scenarioId` from route params, or falls back to the open session from `useSessions` (`src/screens/Session/index.tsx:29-30`, `:115-120`). A `sessionId` param change cancels any live recording and resets transcript, debrief, and readiness (`:81-90`).
2. If the transcript is empty and the session is ready, it calls `advance([])` to get Robin's opening turn (`src/screens/Session/index.tsx:233-237`).
3. `advance` (`:176-223`) sets `thinking`, fetches recent summaries for context via `sessions.recent()`, calls `robin.nextTurn`, appends Robin's turn, saves the transcript, stores any `remember` fact via `memory.remember("fact", ...)`, awaits `say(reply.text)`, then either finishes (if `complete`) or opens the microphone. The mic opens only after `speak()` resolves, so it never records Robin's own voice (`:212-220`).
4. Voice input runs through `useTurnRecorder` (`src/screens/Session/useTurnRecorder.ts`), which wraps recording with a 150 ms poll (`:27`, `:91-108`): permission via `getPermissionStatus`/`requestPermission`, `startRecording({ maxDurationMs: 30000 })`, pause detection via the pure `nextVoiceActivity` detector (`src/screens/Session/voiceActivity.ts:46-91`, defaults `SPEECH_LEVEL 0.4`, `SILENCE_LEVEL 0.25`, `SILENCE_MS 1500`, `MAX_TURN_MS 30000` at `:7-11`), and `stopRecording`/`cancelRecording`. Both the pause detector and the manual stop land on one shared transcribe-and-send path (`src/screens/Session/index.tsx:72-79`, `:241-271`): transcribe with `db.ai.transcribe({ audio: clip, language: "en" })`, delete the temp file with `deleteAsync` (`:252-259`), then send the text through `advance`. Typing is the fallback and cancels any live recording first (`:281-289`). A refused microphone falls back to typing (`:138-141`).
5. Leaving the screen, switching sessions, sending a typed turn, or finishing cancels any live recording so no half-spoken turn is transcribed late (`:123-136`, `:154-156`, `:285`, `:292`). Late async work after unmount or session change is dropped via `mountedRef`/`sessionRef` guards (`:44-51`, `:196`, `:206`, `:215`).
6. Finishing (`finish`, `:150-174`) calls `robin.debrief`, stores the debrief JSON and summary, writes debrief memory notes, and renders the debrief view (`:317-349`).

Text-to-speech uses `speak(text, { language: "en-US", rate: ... })` and slows to `0.85` for Beginner level (`src/screens/Session/index.tsx:143-148`). `stopSpeaking` runs on blur and unmount (`:123-136`).

## Session state

`useSessions`, `useMemory`, and `useProfile` each hold their data in a module-scope shared store created once via `createAppStore` (`src/lib/api/useSessions.tsx:33`, `src/lib/api/useMemory.tsx:12`, `src/lib/api/useProfile.tsx:17`), so every screen that calls the same hook sees the same copy. The earlier per-hook `useState` duplication flagged by Borel at export time in `docs/agent-docs/specs/260919-robin-english-practice/result-from-borel-build.md` is resolved. None of the three stores persists: each resets when the account changes (`src/lib/api/useSessions.tsx:65-72`, `src/lib/api/useMemory.tsx:42-49`, `src/lib/api/useProfile.tsx:94-102`).

## AI model selection

`useRobin.nextTurn` sends Robin's turn with `model: db.ai.models.fast` and runs the tool loop in `runRobinTurn` (`src/lib/api/useRobin.tsx:59-62`, `src/lib/api/robinAgent.ts:50-85`); the debrief uses `db.ai.models.smart` and is parsed with `parseDebrief` (`src/lib/api/useRobin.tsx:67-90`, `src/lib/api/robinAgent.ts:87-101`). The system prompt is built by `buildSystemPrompt` (`src/lib/api/robinPrompt.ts:12-37`): in-character role, level-adjusted complexity, inline corrections, the 45-word cap, memory list, recent-practice recap, and the JSON tool protocol (`search_sessions`, `get_session`, `list_recent_sessions`). Tool calls execute through `runSessionTool` over the `SessionReader` port (`src/lib/api/robinTools.ts:13-16`, `:79-126`), whose live implementation `sessionReader` reads ended `practice_sessions` rows scoped to the user (`src/lib/api/sessionReader.ts:22-46`). The loop is capped at 3 tool rounds (`src/lib/api/robinAgent.ts:22`, `:56-68`); after the third round the model is told to reply without calling another tool (`:24`, `:64-66`).
