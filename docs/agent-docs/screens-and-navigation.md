# Screens and Navigation

Source paths are relative to `apps/mobile/` unless noted.

Navigation is React Navigation 7, wired in `src/navigation/`.

## Container and theme

`src/navigation/NavigationContainer.tsx` wraps the library's container with a
theme derived from `DefaultTheme`, overriding `background #F7F5F0`, `card
#FFFFFF`, `text #242320`, `border #E5E5E4`, and `primary/notification #2F6F5E`.
These match the tokens in `src/lib/ui/theme.ts`.

## Root navigator

`src/navigation/RootNavigator.tsx` defines two param lists and two navigators:

- `RootStackParamList = { Tabs: undefined; Onboarding: undefined; Practice: undefined }`
- `RootTabParamList = { Practice: undefined; Session: { sessionId: string; scenarioId: string } | undefined; Settings: undefined }`

The root native stack picks its single screen at render time from `user`,
`authLoading`, and `data.onboarded`:

```ts
if (!user) return <Stack><Stack.Screen name="Practice" component={PracticeScreen} /></Stack>;
if (authLoading || profileLoading) return <Splash />;
const needsOnboarding = !data.onboarded;
```

- Signed out, a single-screen stack holds `PracticeScreen` with no tab bar. The
  screen's own `RequireAccount` gate then shows the sign-in card.
- While the stored session or the `learner_profiles` read is in flight, the local
  `Splash` renders a `Bird` on the background colour. Both answers are needed
  before a destination is meaningful, and rendering through the gap would show
  the signed-out screen and then Onboarding before the real destination.
- A signed-in user whose profile is not onboarded sees `Onboarding`.
  `useProfile` treats a present `learner_profiles` row as `onboarded: true`
  (`src/lib/api/useProfile.tsx:42-47`). A failed profile read leaves `loading`
  false and the store untouched, so the choice falls to whatever the last
  successful read left.
- Otherwise `Tabs` renders with no `initialRouteName`, so the first tab is
  always Practice.

The tab navigator has `headerShown: false` and spreads `useTabBarOptions` from
`src/lib/ui/TabBar.tsx` with the theme colours. Each tab has a `lucide-react-native`
icon at size 22 and `strokeWidth` from `theme.iconStroke`.

## Screens

### Onboarding (`src/screens/Onboarding/index.tsx`)
Collects a display name and one of three levels (Beginner, Intermediate,
Advanced) and calls `useProfile().save`. Saving upserts `learner_profiles` and
flips the shared profile store to `onboarded: true`, which makes the root
navigator switch to `Tabs` on the next render. Validates a non-empty name.

### Practice (`src/screens/Practice/index.tsx`)
The catalog. Wrapped in `RequireAccount`.
- Reloads the open session on focus via `useFocusEffect`.
- Picks a suggested scene: the first scenario whose `level` matches the profile
  level, else the first scenario (`src/screens/Practice/index.tsx:52-55`).
- `start(scenarioId)` calls `useSessions().create`, then navigates to the Session
  tab with `{ sessionId, scenarioId }`.
- Shows a resume card when an unfinished session exists, and the full list below
  (excluding the suggested one).

### Session (`src/screens/Session/index.tsx`)
The conversation, and the debrief after it. Receives `sessionId`/`scenarioId`
through route params; if absent it adopts the open session from
`useSessions().open`. Shows an `EmptyState` pointing back to Practice when there is
no scene.

State is local to the screen: `sessionId`, `scenarioId`, `transcript`, `thinking`,
`recording`, `typing`, `draft`, `error`, `notice`, `micDenied`, `debrief`,
`finishing`, `ready`. Three refs back the loop: `aliveRef` (false once the screen
unmounts), `turnRef` (a counter that drops a spoken turn the learner has since
moved past), and `openedRef` (which session's opening turn was already
requested). Five effects drive loading and cleanup, in this order:

1. When the route names a session different from the one on screen, adopt the new
   `sessionId`/`scenarioId`, clear `transcript`, `debrief`, and `ready`, and reset
   `openedRef.current` to `null` (`70-81`).
2. Keyed on the route param rather than the state it writes: fetch that session
   with `fetchOne` and load its transcript, or `reloadSessions()` when there is
   no param. Because the key is the param, navigating to the session already on
   screen reloads it rather than wiping it. An `active` flag in the cleanup stops
   the state updates landing on an unmounted screen (`89-110`).
3. Adopt `useSessions().open` once it arrives, while `sessionId` is still unset
   (`115-122`).
4. The unmount cleanup sets `aliveRef.current = false`, calls `cancelRecording()`
   and `void stopSpeaking()` (`124-131`).
5. Once `ready`, with a scenario and an empty transcript, call `advance([])` so
   Robin speaks first. The `openedRef` guard (`if (openedRef.current ===
   sessionId) return; openedRef.current = sessionId;`) keeps a failed opening
   request from re-firing when `thinking` flips back to false (`237-244`).

Key functions:

- `advance(next)` appends a turn, fetches recent debriefs for a recap, calls
  `robin.nextTurn`, appends Robin's reply, saves the transcript, stores a memory
  note when returned, speaks the reply, and either finishes or opens the mic.
  Before speaking it captures `const turn = ++turnRef.current`; after `say()`
  resolves it returns early unless `aliveRef.current` is true and
  `turnRef.current === turn`, so a reply the learner has moved past is not
  spoken over (`221-223`).
- `say(text)` speaks through `speak` with `rate: 0.85` for a Beginner and `1`
  otherwise. Tapping a Robin turn replays it.
- `openMic` now awaits `stopSpeaking()` first, then checks microphone permission
  via `getPermissionStatus("microphone")` and calls
  `startRecording({ maxDurationMs: 30000 })`. On denial, or when the recording
  refuses to start, it falls back to typing and shows an enable-mic affordance
  that `enableMic` resolves through `requestPermission`.
- `cancelAndDiscard` stops speech, calls `cancelRecording()`, and clears
  `recording` and `notice` (`138-143`). The idle bar shows it behind an `X`
  button (lucide `X`, accessibility label "Stop recording and discard") on the
  right while recording; tapping the keyboard switch while recording also calls
  `cancelAndDiscard()` before switching to typing (`427-447`).
- `stopAndSend` stops the recording and calls `db.ai.transcribe`; empty text
  loops back to the mic with a notice.
- `sendTyped` submits the typed draft.
- `finish` increments `turnRef`, stops speech and recording, calls
  `robin.debrief`, persists the debrief JSON + summary, stores debrief memory
  notes, and renders the debrief view. It is declared before `advance` because
  `advance` calls it on the final turn.
- `confirmFinish` asks before finishing early.

The debrief view renders `summary`, `mistakes` (said struck through, better
below), and `tips`, with a button back to Practice.

### Settings (`src/screens/Settings/index.tsx`)
Wrapped in `RequireAccount`. Edits name and level (`useProfile().save`). Under
"Your data" it shows a spinner while `memory.loading` or `sessions.loading` is
true, then the memory-note count and destructive clears for all sessions and all
memory, blocked while a session is open. Under "Account" it renders `AccountPanel`
and `LegalLinks`.

## Session screen dependencies

The screen imports `src/lib/core/borel/borel-systemui` functions directly:
`cancelRecording`, `getPermissionStatus`, `requestPermission`, `speak`,
`startRecording`, `stopRecording`, `stopSpeaking`, plus `db.ai.transcribe`.
Components come from the `lib/ui` barrel, and the domain hooks are imported per
module (`../../lib/api/useSessions`) rather than through the `api` barrel.

## Persistence and resume

An unfinished session is a row with `ended_at is null`. The root navigator does
not read sessions; the Session tab adopts `useSessions().open` when it is opened
with no params, and Practice offers the same row on its resume card. Ended
sessions never resume because `ended_at` is set by `sessions.finish` and the
open-session query filters it out (`src/lib/api/useSessions.tsx:49`).
