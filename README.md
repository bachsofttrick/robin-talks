# Robin Talks

A voice-first [Expo](https://expo.dev) React Native app for non-English speakers who want to speak English, not study it. Each practice session drops you into a short, realistic scenario (ordering coffee, asking for directions) where the AI agent Robin plays the other person, talks through the device, listens to your reply, and coaches your English in passing. Accounts, per-user memory, sessions, and AI calls are backed by the Borel cloud at `api.borel.one`.

## What it does

- **Scenario practice.** The catalog ships 8 scenes, each with a title, a one-line description, a level tag, and an interaction goal. Any level can start any scene (`api/scenarios.ts`).
- **Voice-first turns.** Robin speaks through text-to-speech, then the microphone opens. A pause detector ends your turn after about 1.5 seconds of quiet and transcribes it. You can also stop manually or switch to typing at any time.
- **Inline coaching.** Robin folds a correction or better phrasing into its reply, then continues the scene. The reply is capped at 45 words.
- **Memory.** Robin keeps durable facts plus a learning profile per user and can recall them in later sessions. Memory and sessions are deletable from Settings.
- **Debrief.** When a scene ends, Robin returns a summary, a list of mistakes with better phrasings, and 2 to 3 targeted tips.
- **Resume.** An unfinished session survives a restart and reopens on launch. Ended sessions never resume.

## Run it

```bash
bun install
bunx expo start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on your phone, or press `i` for the iOS simulator, `a` for Android, or `w` for the browser. You need [Node.js](https://nodejs.org) 20 or newer; `bunx expo` fetches the CLI on demand.

Voice recording, text-to-speech, and microphone permissions need a real device or simulator. The browser preview uses a brokered session and is the weakest target for the voice loop.

## Scripts

| Command | Effect |
|---|---|
| `bun start` | `expo start` |
| `bun run ios` / `bun run android` / `bun run web` | Start on one platform |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | `eslint .` with the `eslint-config-expo` flat config |
| `bun run test` | `jest` with the `jest-expo` preset (8 suites, 61 tests) |

A `bun.lock` is present, so Bun works as the package manager too. The commands above use `bun install` as the default path.

## How it is laid out

Source sits at the project root, not under `src/`, so Metro needs no extra configuration.

```
robin-talks/
├── expo-entry.js       Entry point: registerRootComponent + SafeAreaProvider
├── index.tsx           App root: ErrorHandler > StatusBar > AppFonts > CoreProviders > Navigation
├── api/                Domain hooks and pure helpers (useProfile, useSessions, useMemory, useRobin, scenarios)
├── core/               Borel-managed surface: db client, auth, legal (regenerated)
├── navigation/         React Navigation container, root navigator, pure rootRoute decision
├── screens/            Onboarding, Practice, Session (voice loop), Settings
├── ui/                 Design system: theme tokens, fonts, motion, components
├── borel-store.js      Dependency-free reactive store (useSyncExternalStore)
├── borel-systemui.js   Native capability bridge (recording, TTS, permissions, IAP, notifications)
├── assets/             App icon, splash, favicon
└── docs/agent-docs/    Architecture, backend, UI, conventions, workflows, specs
```

The four screens are listed in `screens/`. `Practice` is the catalog, `Session` runs the voice loop and renders the debrief, and `Settings` edits your profile and deletes data. When no session is open the app lands on `Practice`; with one open it lands on `Session`.

## Architecture

The app is client-only: no server, build step, or API layer lives in this repository. Screens read domain data through hooks in `api/` that combine `db.from(table)`, `useAuth()`, and a module-scope shared store, so every screen sees the same copy. The hooks return `{ data, loading, error, ...actions }`, and failed calls route through `plainError` from `core/db.ts`.

The Robin turn is assembled from pure, tested modules. `buildSystemPrompt` (`api/robinPrompt.ts`) sets the persona, level rules, memory, and the JSON tool protocol. `runRobinTurn` (`api/robinAgent.ts`) runs the tool loop over a `SessionReader` port, capped at 3 rounds, and `parseDebrief` shapes the end-of-session report. Tools are `search_sessions`, `get_session`, and `list_recent_sessions`; they run inside the agent loop and are never callable by the client directly.

Voice turns run through `useTurnRecorder` (`screens/Session/useTurnRecorder.ts`), which opens the mic only after `speak()` resolves and polls the recording level every 150 ms. The pure `nextVoiceActivity` detector (`screens/Session/voiceActivity.ts`) ends the turn on silence or at the 30 s ceiling. Audio is never stored; only the transcript and debrief reach the database.

The backend is the Borel cloud proxy. `core/db.ts` defines the endpoints and exposes `db.auth`, `db.storage`, `db.ai`, `db.account`, `db.moderation`, and `db.notify`. AI uses `fast: qwen3-next-80b-a3b-instruct` for turns and `smart: gemini-3-flash` for debriefs and transcription. Data lives in four Postgres tables (`profiles`, `learner_profiles`, `practice_sessions`, `robin_memory`), each scoped to the signed-in user. See `docs/agent-docs/backend-and-ai.md`.

## Borel-managed files

`core/db.ts`, `core/auth.tsx`, and `core/legal.tsx` carry the header `// Managed by Borel. This file is generated and kept in sync automatically.` Do not hand-edit them; put app logic elsewhere. `index.tsx` and `ui/fonts.tsx` are also regenerated, and a file starting with `// borel: custom entry` is left alone.

`borel-store.js` is a dependency-free reactive store. `createStore(key, initial, { persist })` gives every screen one value with nothing to mount. App code reaches it through the typed `createAppStore` wrapper in `api/store.ts`. The three app stores (`robin.profile`, `robin.openSession`, `robin.memory`) do not persist because Postgres is the source of truth, and each resets when the signed-in account changes.

`borel-systemui.js` is a thin bridge over Expo native modules for permissions, recording, speech, sharing, notifications, and Apple sign-in. It requires modules lazily so a missing native module cannot break the app.

## Before you publish to a store

- **Set your own bundle identifier.** `app.json` ships with `com.example.robintalks` as a placeholder. Change it to a domain you control before building for the App Store or Play Store.
- **Replace the icon and splash image** in `assets/` with your own artwork.
- Build with [EAS](https://docs.expo.dev/build/introduction/): `bunx eas build`. No EAS config file exists in this repository yet.

**In-app purchases are real.** `requestPurchase()`, `restorePurchases()`, and `getProducts()` in `borel-systemui.js` call Apple's StoreKit 2 through [expo-iap](https://github.com/hyochan/expo-iap). They need a real build to run, since StoreKit does not exist in Expo Go, so use a development build (`bunx expo run:ios`) or TestFlight. The products must exist in your App Store Connect account with a price, a localization, and a review screenshot, and they must be submitted for review alongside your first version. An `extra.borelIap` block in `app.json` maps each slug your code uses to a real product id; add it and keep it in step with what you create there. Test with a Sandbox tester before shipping.

**One function is deliberately not implemented:** `requestApplePay()`. The exported copy returns `{ status: "failure" }` and logs a warning instead of reporting a completed payment. Apple Pay needs a merchant identifier from your own Apple Developer account, and anything unlocked inside the app must use In-App Purchase, not Apple Pay (App Store Review Guideline 3.1.1).

## Docs

- [architecture.md](docs/agent-docs/architecture.md): components, providers, session lifecycle, data flow.
- [backend-and-ai.md](docs/agent-docs/backend-and-ai.md): Borel client, tables, auth, AI, storage, moderation.
- [ui-and-navigation.md](docs/agent-docs/ui-and-navigation.md): navigation structure, screens, design system.
- [borel-runtime.md](docs/agent-docs/borel-runtime.md): `borel-store.js` and `borel-systemui.js`.
- [conventions.md](docs/agent-docs/conventions.md): code style and patterns.
- [workflows.md](docs/agent-docs/workflows.md): install, run, typecheck, test, build.
- [directory-map.md](docs/agent-docs/directory-map.md): annotated tree of the repository.
- [specs/260919-robin-english-practice/](docs/agent-docs/specs/260919-robin-english-practice/spec.md): the feature spec, plan, tasks, and the Borel export report.
