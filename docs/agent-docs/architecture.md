# Architecture

Source paths are relative to `apps/mobile/` unless noted.

Robin Talks is one Expo React Native application, `apps/mobile`, inside a
monorepo. All code that runs lives under `src/`, and the app talks to two remote
systems: the backend in `apps/backend` (auth, the app's own data, and all AI
transport on both surfaces) and the Borel cloud proxy (file storage,
moderation, notifications; AI image generation reaches Borel through the
backend's `/api/ai` proxy, so the device never calls OpenRouter or Borel's AI
endpoints directly). The app is
client-only: it holds no server code and no build step. `apps/backend/` is a
separate Hono service that runs a better-auth account service at `/api/auth/*`,
an authenticated data API at `/api/data/*`, and an authenticated AI router at
`/api/ai` over drizzle and Neon Postgres
(see [backend-and-ai.md](backend-and-ai.md)); the native app authenticates against
it and stores its profile, sessions, and memory through `/api/data/*`, and the
browser preview uses the same backend with cookie credentials.

## Layer map

```
apps/mobile/expo-entry.js  (polyfills, SafeAreaProvider, registerRootComponent)
  -> src/index.tsx  (ErrorHandler > StatusBar > AppFonts > CoreProviders > NavigationContainer > RootNavigator)
       -> src/lib/core/     backend kit: db, auth, legal (Borel-managed connectors + submodules)
       -> src/lib/ui/       visual kit and theme tokens
       -> src/lib/api/      domain hooks + scenario data
       -> src/navigation/   React Navigation container and root navigator
       -> src/screens/      Onboarding, Practice, Session, Settings
```

The stacking is literal in `src/index.tsx:14-26`:
`ErrorHandler` (a class error boundary, `src/lib/ui/ErrorHandler/index.tsx`),
`StatusBar`, `AppFonts` (loads Lora and Manrope, `src/lib/ui/fonts.tsx`),
`CoreProviders` (mounts `AuthProvider` only, `src/lib/core/index.tsx`),
`NavigationContainer` (applies `navigationTheme`, `src/navigation/NavigationContainer.tsx`),
then `RootNavigator`.

## Data and state flow

- **Remote source of truth:** auth and the app's Postgres data live behind
  `apps/backend` on both surfaces. `src/lib/core/db.ts` assembles one `db` object
  from submodules and attaches `auth`, `storage`, `ai`, `account`, `moderation`,
  `notify`.
- **Domain hooks** in `src/lib/api/` call the backend data client
  (`src/lib/core/db/data.ts`, `/api/data/*`) on both surfaces. Both combine the
  signed-in user from `useAuth()` and, for profile state, a module-scope store
  from `src/lib/core/borel/borel-store.js`. Screens import
  these hooks, not `db`, except for the `db.ai.transcribe` call in the Session
  screen; every AI call, including that one, reaches the backend's `/api/ai`
  router through the thin client in `src/lib/core/db/ai.ts`.
- **Shared UI state** uses `createStore` from
  `src/lib/core/borel/borel-store.js`: a module singleton read through
  `useSyncExternalStore`, so every screen sees one value. Only `robin.profile`
  opts into `{ persist: true }` (`src/lib/api/useProfile.tsx:15`); sessions and
  memory are not persisted because Postgres is the source of truth. React
  Context is used only for auth.

## Root navigation states

`src/navigation/RootNavigator.tsx` picks one of four shapes from `useAuth().user`,
`useAuth().loading`, and `useProfile().data.onboarded`: the bird `Splash` while
auth or the profile read is in flight, a single-screen stack holding only
`PracticeScreen` when there is no `user`, `Onboarding` while the profile is not
onboarded, and `Tabs` otherwise. `PracticeScreen` and `SettingsScreen` gate
their own data with `RequireAccount`, so the signed-out stack shows the sign-in
card rather than the tab bar.

## A practice session, end to end

1. The learner taps a scene in `src/screens/Practice/index.tsx`. `useSessions().create`
   inserts a row into `practice_sessions` and navigates to the Session tab with
   `{ sessionId, scenarioId }` (`src/screens/Practice/index.tsx:57-67`).
2. `src/screens/Session/index.tsx` loads the row named by the route param
   (`fetchOne`), or adopts the open session from `useSessions().open` when the
   screen is opened with no params, and on an empty transcript calls `advance([])`
   so Robin speaks first (`src/screens/Session/index.tsx:89-110, 237-244`).
3. `advance` calls `useRobin().nextTurn`, which builds a persona prompt with the
   scene, the learner's level and name, stored memory, and a recap of recent
   debriefs, then sends it to
   `db.ai.chat({ jsonSchema: TURN_SCHEMA, model: db.ai.models.fast })`
   (`src/lib/api/useRobin.tsx:83-120`). The schema fixes the reply shape to
   `{ text, complete, remember }`.
4. Robin's reply is appended to the transcript, saved with `saveTranscript`,
   `remember` is stored via `useMemory().remember`, then `speak()` reads it aloud
   through `src/lib/core/borel/borel-systemui.js`.
5. With `complete: false`, the microphone opens. The learner taps **Stop and send**;
   `db.ai.transcribe` writes the recording down and the user turn is appended,
   looping back to step 3. The learner can switch to typing at any time.
6. When Robin returns `complete: true` or the learner taps **Finish now**, `finish`
   calls `useRobin().debrief` with `jsonSchema: DEBRIEF_SCHEMA` and model
   `db.ai.models.smart`, persists the debrief JSON and summary via
   `sessions.finish`, stores debrief memory notes, and swaps the screen to the
   debrief view.
 7. Raw audio is never stored. Only the transcript and the debrief JSON reach the
    database.

## AI boundary

All AI transport runs in the backend's `/api/ai` router
(`apps/backend/src/routes/ai/`, shared helpers in `apps/backend/src/lib/ai/`), mounted by `createApp()`; `src/lib/core/db/ai.ts`
is the thin client that POSTs to it and keeps the public `db.ai` surface:
- `ai.chat` POSTs to `/api/ai/chat`. The backend calls OpenRouter through the
  `@openrouter/sdk` (`OpenRouterCore` + `chatSend`), pins the provider to
  OpenAI, turns a `jsonSchema` into OpenRouter's `response_format` (`json_schema`,
  `strict: true`), reads the reply with `readJson` (fences and surrounding words
  tolerated), and retries once before reporting the "unreadable" sentence. The
  key is backend-only (`OPENROUTER_API_KEY` in `apps/backend`); the mobile app
  no longer reads `EXPO_PUBLIC_OPENROUTER_API_KEY`.
- `ai.transcribe` POSTs to `/api/ai/transcribe`; the backend fetches OpenRouter's
  `/audio/transcriptions` with model `google/gemini-3.5-transcribe`.
- `ai.image` and `ai.editImage` POST to `/api/ai/images/generations` and
  `/images/edits`, which transparently proxy Borel (`BOREL_AI_URL`), because
  Borel stores generated images in the app's own files.
- The router is session-gated by the better-auth cookie: no session is 401
  `{ "error": "You need to sign in first." }`, and 200 with a result body is the
  only other outcome.
- Every AI call asks for consent first (`src/lib/core/db/consent.ts`), once per
  company and per kind, before anything leaves the device.

See [backend-and-ai.md](backend-and-ai.md) for detail and
[api-layer.md](api-layer.md) for the hooks and tables.
