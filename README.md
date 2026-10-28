# Robin Talks

A voice-first [Expo](https://expo.dev) React Native app for non-English speakers who want to speak English, not study it. Each practice session drops you into a short, realistic scenario (ordering coffee, asking for directions) where the AI agent Robin plays the other person, talks through the device, listens to your reply, and coaches your English in passing. Accounts and the app's profile, sessions, and memory are backed by the `apps/backend` Hono service (better-auth plus a drizzle/Neon Postgres data API) on both a device and the browser preview, and all AI transport runs in that backend's `/api/ai` router, which calls OpenRouter for chat and speech-to-text.

## What it does

- **Scenario practice.** The catalog ships 8 scenes, each with an id, title, description, level, goal, Robin's role, and a setting (`src/lib/api/scenarios.ts`). Beginner (coffee, directions, pharmacy), Intermediate (checkin, smalltalk, return), and Advanced (interview, complaint). Any level can start any scene.
- **Voice-first turns.** Robin speaks through text-to-speech, then the microphone opens. You tap **Stop and send** to end your turn and transcribe it, or switch to typing at any time. Recordings are capped at 30 seconds.
- **Inline coaching.** Robin folds a correction or better phrasing into its reply, then continues the scene. The reply is capped at 45 words.
- **Memory.** Robin keeps durable facts, learning profile, performance per user and can recall them in later sessions. Memory and sessions are deletable from Settings.
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
bun run dev
```

## Repository layout

This is a Bun and Turborepo monorepo. The app described here lives in `apps/mobile` (package `@robin-talks/mobile`); source paths below are relative to that directory unless noted.

- `apps/mobile/` - the Expo React Native app (all of this README's subject matter)
- `apps/backend/` - a Hono service that runs a better-auth account service (drizzle + Neon Postgres) at `/api/auth/*`, the app's authenticated data API at `/api/data/*`, and the AI router at `/api/ai`; both the device app and the browser preview talk to it
- `docs/agent-docs/` - the agent knowledge base, plus sdd/pdd specs and plans


## Scripts

From the repository root, every task fans out through Turborepo:

| Command | Effect |
|---|---|
| `bun install` | One install for both workspaces (Bun 1.4.2, hoisted layout) |
| `bun run dev` | `turbo run dev`; runs `env:link` first, then starts the dev servers |
| `bun run lint` | `eslint .` in both workspaces (`eslint-config-expo` in mobile, a flat config in the backend) |
| `bun run typecheck` | `tsc --noEmit` in both workspaces |
| `bun run test` | `jest` with the `jest-expo` preset in mobile (10 suites, 148 tests) and `bun test` in the backend |
| `bun run build` | Compile backend to js files and mobile to apk export |
| `bun run env:link` | Points `apps/*/.env` at the shared root `.env` |

The same commands work from inside `apps/mobile` without Turbo: `bun dev`,
`bun run ios` / `bun run android` / `bun run web`, `bun run typecheck`,
`bun run lint`, `bun run test`.

## Environment

One root `.env` serves both workspaces. `apps/mobile/.env` and
`apps/backend/.env` are relative symlinks to `../../.env`, created and refreshed
by `bun run env:link` (which `bun run dev` already depends on). Edit the root file
and copy `.env.example` to it once after cloning. EAS remote builds upload only
the app directory, so the root `.env` does not reach them; set `EXPO_PUBLIC_*`
values as EAS environment variables instead.

## How to build APK file (Linux)

1. Install `openjdk-jdk`.
2. Get the Android SDK from [https://developer.android.com/studio](https://developer.android.com/studio) and install it. Later, add an environment key `ANDROID_HOME` to `~/.bashrc`.
3. Add a temporary build folder in `EAS_LOCAL_BUILD_WORKINGDIR` to `.env`, for example, `/opt/Android/tmp`, so it doesn't build in RAM (the build takes a lot of RAM).
4. Run `./generate-local-credential-apk` to generate local credential to build an APK.
5. Go inside `apps/mobile`. Run `./clear-gradle` first to remove old gradle files (it will screw up APK building)
6. Run `bun run local`.  
6a. Run `bun run build` for production AAB file.  
6b. Run `bun run preview` for preview APK file using Expo Service credential.
