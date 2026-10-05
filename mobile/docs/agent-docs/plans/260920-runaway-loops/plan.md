# Bugfix: Runaway render/network loops in profile, session, and AI state

Status: draft
Bug report: Driven through a headed browser session at `localhost:8081` (Expo web) as a real user. After sign-in the app hammers the API until it is rate-limited, and once a scene is open it hammers the AI endpoint forever, including after sign-out.

## Analysis

Two independent loops share one cause pattern: an effect that re-runs because of an unstable dependency or a per-instance guard over a shared store.

### Bug A: sign-in remount/refetch storm (critical)

`src/lib/api/useProfile.tsx:96-102`, `src/lib/api/useSessions.tsx:66-72`, and `src/lib/api/useMemory.tsx:43-49` each guard a shared-store reset with a per-instance `useRef`:

```ts
const prevUserId = useRef<string | null | undefined>(undefined);
useEffect(() => {
  if (prevUserId.current !== userId) {
    prevUserId.current = userId;
    profileStore.reset(); // shared, module-scope store
  }
  void Promise.resolve().then(() => reload());
}, [userId, reload]);
```

The stores are module-scope singletons (`src/lib/api/useProfile.tsx:17`, `src/lib/api/useSessions.tsx:33`, `src/lib/api/useMemory.tsx:12` via `src/lib/api/store.ts:19-23`), but the guard is not. `RootNavigator` and every screen each call these hooks (`src/navigation/RootNavigator.tsx:61-62`, `src/screens/Practice/index.tsx:40-41`, `src/screens/Session/index.tsx:24-26`, `src/screens/Settings/index.tsx:20-22`, `src/screens/Onboarding/index.tsx:20`). On each fresh mount `prevUserId.current` is `undefined`, so `undefined !== userId` is true and the shared store resets to `EMPTY` (`onboarded: false`, `src/lib/api/useProfile.tsx:15`).

`src/navigation/rootRoute.ts:30-31` routes to Onboarding whenever `profile.data.onboarded` is false, while each hook instance keeps its own `loading` flag (`src/lib/api/useProfile.tsx:42`), so the loading gate is skipped. The sequence repeats: reset -> route Onboarding -> Onboarding mounts a new `useProfile` -> reset -> reload sets `onboarded: true` -> route Tabs -> tab screens mount -> reset -> Onboarding again. Every cycle also schedules `reload()` on mount, so `GET /db/learner_profiles` and `GET /db/practice_sessions` fire continuously.

Observed in the browser: React commits alternated `OnboardingScreen` and `Tabs`/`BottomTabNavigator` ~15 times/second; the Onboarding name `<input>` DOM node was replaced within seconds so typing never stuck; ~414 identical `learner_profiles` requests plus ~400 `practice_sessions` requests were sent until Borel returned HTTP 429.

### Bug B: AI retry storm on failure (critical)

`src/screens/Session/index.tsx:244-248` auto-starts the scene:

```ts
useEffect(() => {
  if (ready && sessionId && scenario && transcript.length === 0 && !thinking && !debrief) {
    void Promise.resolve().then(() => advance([]));
  }
}, [ready, sessionId, scenario, transcript.length, thinking, debrief, advance]);
```

`advance` (`src/screens/Session/index.tsx:187-234`) lists whole hook-return objects in its dependency array: `profile`, `memory`, `sessions`, `robin`, plus `finish` (which itself depends on `robin` and `sessions`). Those are new object literals every render (`src/lib/api/useProfile.tsx:117`, `src/lib/api/useSessions.tsx:140`, `src/lib/api/useRobin.tsx:92`), so `advance` is a new function every render and the effect re-runs every render. On a successful turn `transcript` becomes non-empty and the condition stops; on an AI error (`reply.text` null, `src/screens/Session/index.tsx:208-211`) `thinking` returns to false with `transcript` still empty, so the effect immediately calls `advance([])` again with no backoff.

Observed in the browser: the Borel AI endpoint returned 502/429 and the app issued ~4.5 `/ai/chat/completions` requests per second indefinitely. The Session tab stays mounted when hidden (bottom tabs) and has no focus or auth guard, so the loop continued after the user signed out.

### Other issues found (not fixed by this plan)

- `src/screens/Settings/index.tsx:32-43`: a failed save sets `problem` but never clears the previous `message`, so "Saved." stays on screen next to the new error.
- `src/lib/core/auth.tsx:878`: "At least 8 characters." is shown as permanent helper text in the create-account step, not only when the password is short. `src/lib/core/auth.tsx` is Borel-managed and regenerated, so out of scope.
- `src/lib/core/db.ts:236-244`: AI consent uses `Alert.alert` button callbacks. In the browser preview `react-native-web` does not invoke them, so `askAiConsent` never resolves and the first session turn hangs on "Robin is speaking". `src/lib/core/db.ts` is Borel-managed, so out of scope. The same Alert limitation affects the delete-sessions/memory and finish-now confirmations in the web preview only; they work on a device.

## Reproduction

1. `bun install && bunx expo start`, then open `localhost:8081` in a browser.
2. Create an account and complete onboarding (or sign in to an account that already has a `learner_profiles` row).
3. Expected: the app settles on the Practice catalog. Observed: the screen flips between Onboarding and the tabs; typing in the name field is wiped; the network panel shows hundreds of repeated `learner_profiles` / `practice_sessions` calls and HTTP 429.
4. Open any scene. Expected: Robin speaks one line. Observed (when the AI endpoint errors): the Session screen retries `/ai/chat/completions` about 4-5 times per second forever, and keeps retrying after switching tabs or signing out.

## Fix Approach

Give the shared-store reset a module-scope owner id so a store is reset only when the signed-in user actually changes, not on every hook mount. Separately, make the Session auto-start run at most once per session id and depend only on stable callbacks/primitives, so an AI failure stops the loop and waits for the existing manual retry. Also clear the stale Settings message when a save fails.

## Affected Code

- `src/lib/api/useProfile.tsx`: replace the per-instance `prevUserId` ref with a module-level owner id checked before `profileStore.reset()`.
- `src/lib/api/useSessions.tsx`: same module-level owner guard for `openSessionStore.reset()`.
- `src/lib/api/useMemory.tsx`: same module-level owner guard for `memoryStore.reset()`.
- `src/screens/Session/index.tsx`: add a per-session one-shot guard for the initial `advance([])`; narrow `advance` and `finish` dependency arrays to stable functions and primitives (`profile.level`, `profile.displayName`, `robin.nextTurn`, `robin.debrief`, `sessions.recent`, `sessions.saveTranscript`, `sessions.finish`) instead of whole hook objects; do not auto-retry on AI error.
- `src/screens/Settings/index.tsx`: clear `message` when a save fails (and clear `problem` on success) so only one status shows.
