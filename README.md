# Robin Talks

A voice-first [Expo](https://expo.dev) React Native app for non-English speakers who want to speak English, not study it. Each practice session drops you into a short, realistic scenario (ordering coffee, asking for directions) where the AI agent Robin plays the other person, talks through the device, listens to your reply, and coaches your English in passing. Accounts and the app's profile, sessions, and memory are backed by the `apps/backend` Hono service (better-auth plus a drizzle/Neon Postgres data API) on both a device and the browser preview, and all AI transport runs in that backend's `/api/ai` router, which calls OpenRouter for chat and speech-to-text and proxies Borel's AI image generation. The Borel cloud at `api.borel.one` still fronts file storage, moderation, and notifications.

## Repository layout

This is a Bun and Turborepo monorepo. The app described here lives in `apps/mobile` (package `@robin-talks/mobile`); source paths below are relative to that directory unless noted.

- `package.json` - the private `robin-talks-monorepo` root: workspaces `apps/*`, `packageManager: bun@1.4.2`, and the turbo-driven scripts
- `turbo.json` - the task graph shared by both workspaces
- `bunfig.toml` / `bun.lock` - one hoisted install for the whole repo, with a single lockfile
- `scripts/link-env.mjs` - `bun run env:link`, which points each workspace `.env` symlink at the root `.env`
- `.env` / `.env.example` - the only real env files; `apps/mobile/.env` and `apps/backend/.env` are symlinks to `../../.env`
- `apps/mobile/` - the Expo React Native app (all of this README's subject matter)
- `apps/backend/` - a Hono service that runs a better-auth account service (drizzle + Neon Postgres) at `/api/auth/*`, the app's authenticated data API at `/api/data/*`, and the AI router at `/api/ai`; both the device app and the browser preview talk to it
- `docs/agent-docs/` - the agent knowledge base, plus sdd/pdd specs and plans

## What it does

- **Scenario practice.** The catalog ships 8 scenes, each with an id, title, description, level, goal, Robin's role, and a setting (`src/lib/api/scenarios.ts`). Beginner (coffee, directions, pharmacy), Intermediate (checkin, smalltalk, return), and Advanced (interview, complaint). Any level can start any scene.
- **Voice-first turns.** Robin speaks through text-to-speech, then the microphone opens. You tap **Stop and send** to end your turn and transcribe it, or switch to typing at any time. Recordings are capped at 30 seconds.
- **Inline coaching.** Robin folds a correction or better phrasing into its reply, then continues the scene. The reply is capped at 45 words.
- **Memory.** Robin keeps durable facts plus a learning profile per user and can recall them in later sessions. Memory and sessions are deletable from Settings.
- **Debrief.** When a scene ends, Robin returns a summary, a list of mistakes with better phrasings, and tips.
- **Resume.** An unfinished session survives a restart and reopens on launch. Ended sessions never resume.

## Run it

From the repository root:

```bash
bun install
bun run dev
```

`bun run dev` is `turbo run dev` (both workspaces name their task `dev`), and it
first runs `bun run env:link` to refresh the two workspace `.env` symlinks.

You can also work inside the workspace directly:

```bash
cd apps/mobile
bun start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on your phone, or press `i` for the iOS simulator, `a` for Android, or `w` for the browser. You need [Node.js](https://nodejs.org) 20 or newer.

Voice recording, text-to-speech, and microphone permissions need a real device or simulator. The browser preview is the weakest target for the voice loop.

## Scripts

From the repository root, every task fans out through Turborepo:

| Command | Effect |
|---|---|
| `bun install` | One install for both workspaces (Bun 1.4.2, hoisted layout) |
| `bun run dev` | `turbo run dev`; runs `env:link` first, then starts the dev servers |
| `bun run lint` | `eslint .` in both workspaces (`eslint-config-expo` in mobile, a flat config in the backend) |
| `bun run typecheck` | `tsc --noEmit` in both workspaces |
| `bun run test` | `jest` with the `jest-expo` preset in mobile (10 suites, 148 tests) and `bun test` in the backend |
| `bun run build` | `tsc -p tsconfig.build.json` in `apps/backend`, emitting `dist/` |
| `bun run env:link` | Points `apps/*/.env` at the shared root `.env` |

The same commands work from inside `apps/mobile` without Turbo: `bun start`,
`bun run ios` / `bun run android` / `bun run web`, `bun run typecheck`,
`bun run lint`, `bun run test`.

There is one lockfile, `bun.lock` at the repository root, and Bun is the package
manager for both workspaces.

## Environment

One root `.env` serves both workspaces. `apps/mobile/.env` and
`apps/backend/.env` are relative symlinks to `../../.env`, created and refreshed
by `bun run env:link` (which `bun run dev` already depends on). Edit the root file
and copy `.env.example` to it once after cloning. EAS remote builds upload only
the app directory, so the root `.env` does not reach them; set `EXPO_PUBLIC_*`
values as EAS environment variables instead.

## Architecture

The mobile app is client-only: no server or build step lives under `apps/mobile`. On both a device and the browser preview the app authenticates against `apps/backend` and its domain hooks read and write through the typed data client in `src/lib/core/db/data.ts` (`/api/data/*`). Both combine `useAuth()` and, for the profile, a `createStore` value from `src/lib/core/borel/borel-store.js`, so every screen sees the same copy. The hooks return `{ data, loading, error, ...actions }`, and failed calls route through `plainError` from `src/lib/core/db`.

The Robin turn is one `db.ai.chat` call. `nextTurn` (`src/lib/api/useRobin.tsx`) builds a persona prompt from the scene, the learner's level and name, stored memory, and a recap of recent debriefs, then asks for a JSON reply of `{ text, complete, remember }` and enforces the 45-word cap. `debrief` scripts the transcript and asks for a summary, mistakes, tips, and memory notes.

Voice turns are owned by the Session screen (`src/screens/Session/index.tsx`). It opens the mic only after `speak()` resolves, records through `src/lib/core/borel/borel-systemui.js`, then calls `db.ai.transcribe` on manual stop. Audio is never stored; only the transcript and debrief reach the database.

The Borel cloud proxy remains the remote service layer for file storage, moderation, and notifications; the app's own data, auth, and AI are served by `apps/backend` on both surfaces. `src/lib/core/db.ts` defines the endpoints and exposes `db.auth`, `db.storage`, `db.ai`, `db.account`, `db.moderation`, and `db.notify`. `db.ai` is a thin client over the backend's `/api/ai` router: chat (`fast` and `smart` are both `openai/gpt-6-luna`) and transcription (`google/gemini-3.5-transcribe`) call OpenRouter from the backend, while image generation is proxied to Borel, which stores the picture and reuses it for the same prompt. Data lives in four Postgres tables (`profiles`, `learner_profiles`, `practice_sessions`, `robin_memory`), created by `apps/backend/drizzle/0001_complete_silver_fox.sql` and scoped to the signed-in user. These tables are served by the backend's `/api/data/*` router on both surfaces. See `docs/agent-docs/backend-and-ai.md`.

## Borel-managed files

`src/lib/core/db.ts`, `src/lib/core/auth.tsx`, and `src/lib/core/legal.tsx` carry the header `// Managed by Borel. This file is generated and kept in sync automatically.` Do not hand-edit them; put app logic elsewhere. The implementation lives in the `db/` and `auth/` subfolders next to them, so add a new concern as a submodule and re-export it from the connector. `src/index.tsx` and `src/lib/ui/fonts.tsx` are Borel-generated as well, and a file starting with `// borel: custom entry` is left alone.

`src/lib/core/borel/borel-store.js` is a dependency-free reactive store. `createStore(key, initial, { persist })` gives every screen one value with nothing to mount, wrapped in a module singleton read with `useSyncExternalStore`. `useProfile` persists its `robin.profile` value because the value must survive a cold start; sessions and memory do not persist because Postgres is the source of truth.

`src/lib/core/borel/borel-systemui.js` is a thin bridge over Expo native modules for permissions, recording, speech, sharing, notifications, and Apple sign-in. It requires modules lazily so a missing native module cannot break the app.

## Backend

`apps/backend` is a standalone [Hono](https://hono.dev) service that runs the app's
better-auth account service at `/api/auth/*` and its authenticated data API at
`/api/data/*`. It stores accounts and the app's profile, sessions, and memory in
Neon Postgres through drizzle, and delivers verification and password-reset codes
through a pluggable OTP transport. The app points at it on both surfaces; it shares the root install, so
there is no separate install step:

```bash
cd apps/backend
bun run dev         # hot-reload src/index.ts at http://localhost:3000
bun run typecheck   # tsc --noEmit
bun run test        # bun test (database-backed tests skip without a database)
bun run build       # tsc -p tsconfig.build.json, emits dist/
bun run db:migrate  # apply the drizzle migration to Neon
bun run db:verify   # migrate twice, then assert the auth and app tables
```

From the repository root, `bun run build`, `bun run lint`, `bun run typecheck`, and
`bun run test` cover this workspace too.

## Before you publish to a store

- **Set your own bundle identifier.** `app.json` ships with `com.example.robintalks` as a placeholder. Change it to a domain you control before building for the App Store or Play Store.
- **Replace the icon and splash image** in `assets/` with your own artwork.
- Build with [EAS](https://docs.expo.dev/build/introduction/): `bunx eas build`. No EAS config file exists in this repository yet.

**In-app purchases are real.** `requestPurchase()`, `restorePurchases()`, and `getProducts()` in `src/lib/core/borel/borel-systemui.js` call Apple's StoreKit 2 through [expo-iap](https://github.com/hyochan/expo-iap). They need a real build to run, since StoreKit does not exist in Expo Go, so use a development build (`bunx expo run:ios`) or TestFlight. The products must exist in your App Store Connect account with a price, a localization, and a review screenshot, and they must be submitted for review alongside your first version. An `extra.borelIap` block in `app.json` maps each slug your code uses to a real product id; add it and keep it in step with what you create there. Test with a Sandbox tester before shipping.

**One function is deliberately not implemented:** `requestApplePay()`. The exported copy returns `{ status: "failure" }` and logs a warning instead of reporting a completed payment. Apple Pay needs a merchant identifier from your own Apple Developer account, and anything unlocked inside the app must use In-App Purchase, not Apple Pay (App Store Review Guideline 3.1.1).
