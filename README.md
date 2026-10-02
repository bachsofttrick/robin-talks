# Robin Talks

A voice-first [Expo](https://expo.dev) React Native app for non-English speakers who want to speak English, not study it. Each practice session drops you into a short, realistic scenario (ordering coffee, asking for directions) where the AI agent Robin plays the other person, talks through the device, listens to your reply, and coaches your English in passing. Accounts, per-user memory, sessions, and AI calls are backed by the Borel cloud at `api.borel.one`, while chat and speech-to-text go directly to OpenRouter.

## What it does

- **Scenario practice.** The catalog ships 8 scenes, each with an id, title, description, level, goal, Robin's role, and a setting (`src/lib/api/scenarios.ts`). Beginner (coffee, directions, pharmacy), Intermediate (checkin, smalltalk, return), and Advanced (interview, complaint). Any level can start any scene.
- **Voice-first turns.** Robin speaks through text-to-speech, then the microphone opens. You tap **Stop and send** to end your turn and transcribe it, or switch to typing at any time. Recordings are capped at 30 seconds.
- **Inline coaching.** Robin folds a correction or better phrasing into its reply, then continues the scene. The reply is capped at 45 words.
- **Memory.** Robin keeps durable facts plus a learning profile per user and can recall them in later sessions. Memory and sessions are deletable from Settings.
- **Debrief.** When a scene ends, Robin returns a summary, a list of mistakes with better phrasings, and tips.
- **Resume.** An unfinished session survives a restart and reopens on launch. Ended sessions never resume.

## Run it

```bash
bun install
bun start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on your phone, or press `i` for the iOS simulator, `a` for Android, or `w` for the browser. You need [Node.js](https://nodejs.org) 20 or newer.

Voice recording, text-to-speech, and microphone permissions need a real device or simulator. The browser preview uses a brokered session and is the weakest target for the voice loop.

## Scripts

| Command | Effect |
|---|---|
| `bun start` | `expo start` |
| `bun run ios` / `bun run android` / `bun run web` | Start on one platform |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | `eslint .` with the `eslint-config-expo` flat config |
| `bun run test` | `jest` with the `jest-expo` preset (5 suites, 53 tests) |

A `bun.lock` is present, so Bun is the package manager. The commands above use `bun install` as the default path.

## Architecture

The app is client-only: no server, build step, or API layer lives in this repository. Screens read domain data through hooks in `src/lib/api/` that combine `db.from(table)`, `useAuth()`, and a `createStore` value from `borel-store.js`, so every screen sees the same copy. The hooks return `{ data, loading, error, ...actions }`, and failed calls route through `plainError` from `src/lib/core/db`.

The Robin turn is one `db.ai.chat` call. `nextTurn` (`src/lib/api/useRobin.tsx`) builds a persona prompt from the scene, the learner's level and name, stored memory, and a recap of recent debriefs, then asks for a JSON reply of `{ text, complete, remember }` and enforces the 45-word cap. `debrief` scripts the transcript and asks for a summary, mistakes, tips, and memory notes.

Voice turns are owned by the Session screen (`src/screens/Session/index.tsx`). It opens the mic only after `speak()` resolves, records through `borel-systemui.js`, then calls `db.ai.transcribe` on manual stop. Audio is never stored; only the transcript and debrief reach the database.

The backend is the Borel cloud proxy. `src/lib/core/db.ts` defines the endpoints and exposes `db.auth`, `db.storage`, `db.ai`, `db.account`, `db.moderation`, and `db.notify`. Chat and transcription go straight from the device to OpenRouter (`fast` and `smart` are both `openai/gpt-6-luna`, transcription is `qwen/qwen3-asr-0.6b`); image generation stays on Borel. Data lives in four Postgres tables (`profiles`, `learner_profiles`, `practice_sessions`, `robin_memory`), each scoped to the signed-in user. See `docs/agent-docs/backend-and-ai.md`.

## Borel-managed files

`src/lib/core/db.ts`, `src/lib/core/auth.tsx`, and `src/lib/core/legal.tsx` carry the header `// Managed by Borel. This file is generated and kept in sync automatically.` Do not hand-edit them; put app logic elsewhere. The implementation lives in the `db/` and `auth/` subfolders next to them, so add a new concern as a submodule and re-export it from the connector. `src/index.tsx` and `src/lib/ui/fonts.tsx` are Borel-generated as well, and a file starting with `// borel: custom entry` is left alone.

`borel-store.js` is a dependency-free reactive store. `createStore(key, initial, { persist })` gives every screen one value with nothing to mount, wrapped in a module singleton read with `useSyncExternalStore`. `useProfile` persists its `robin.profile` value because the value must survive a cold start; sessions and memory do not persist because Postgres is the source of truth.

`borel-systemui.js` is a thin bridge over Expo native modules for permissions, recording, speech, sharing, notifications, and Apple sign-in. It requires modules lazily so a missing native module cannot break the app.

## Before you publish to a store

- **Set your own bundle identifier.** `app.json` ships with `com.example.robintalks` as a placeholder. Change it to a domain you control before building for the App Store or Play Store.
- **Replace the icon and splash image** in `assets/` with your own artwork.
- Build with [EAS](https://docs.expo.dev/build/introduction/): `bunx eas build`. No EAS config file exists in this repository yet.

**In-app purchases are real.** `requestPurchase()`, `restorePurchases()`, and `getProducts()` in `borel-systemui.js` call Apple's StoreKit 2 through [expo-iap](https://github.com/hyochan/expo-iap). They need a real build to run, since StoreKit does not exist in Expo Go, so use a development build (`bunx expo run:ios`) or TestFlight. The products must exist in your App Store Connect account with a price, a localization, and a review screenshot, and they must be submitted for review alongside your first version. An `extra.borelIap` block in `app.json` maps each slug your code uses to a real product id; add it and keep it in step with what you create there. Test with a Sandbox tester before shipping.

**One function is deliberately not implemented:** `requestApplePay()`. The exported copy returns `{ status: "failure" }` and logs a warning instead of reporting a completed payment. Apple Pay needs a merchant identifier from your own Apple Developer account, and anything unlocked inside the app must use In-App Purchase, not Apple Pay (App Store Review Guideline 3.1.1).
