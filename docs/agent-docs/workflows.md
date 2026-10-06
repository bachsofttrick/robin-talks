# Workflows

Source paths are relative to `apps/mobile/` unless noted.

Commands are taken from `package.json`, `eslint.config.mjs`, and the Jest config
block in `package.json`. Bun is the package manager (`bun.lock` is present). All
mobile commands below run from `apps/mobile`.

## Install

```bash
bun install
```

Add a dependency with `bun add <pkg>`; the lockfile is `apps/mobile/bun.lock`.
The root `README.md` states Node.js 20 or newer is required (Expo fetches its
CLI on demand with `bunx expo`).

## Run

```bash
bun start          # ELECTRON_DISABLE_SANDBOX=1 expo start
bun run android    # expo start --android
bun run ios        # expo start --ios
bun run web        # expo start --web
```

`package.json` sets `"main": "expo-entry.js"`, so Expo boots through
`expo-entry.js` (polyfills, `SafeAreaProvider`) and then `src/index.tsx`.
Voice recording, text-to-speech, and microphone permissions need a real device or
simulator; the web preview is the weakest target for the voice loop.

## Test

```bash
bun run test       # jest
```

Uses the `jest-expo` preset (`package.json` `"jest"` block) with a
`transformIgnorePatterns` list that must keep `@openrouter/sdk` (and `zod`)
transpilable. Test files are colocated with source as `*.test.ts`:

| File | Covers |
|---|---|
| `src/lib/core/db/ai.test.ts` | chat transport, error mapping, JSON read and retry, structured-output response format, photo encoding, transcribe |
| `src/lib/core/db/consent.test.ts` | consent wording/keys and the ask-once flow |
| `src/lib/core/auth/errors.test.ts` | `authErrorMessage` translation |
| `src/lib/core/auth/labels.test.ts` | `labelsWith` overrides |
| `src/lib/polyfills/responsePolyfill.test.ts` | `Response.json` polyfill |

Current totals: 5 suites, 56 tests. Tests mock `./config`, `./notify`,
`./consent`, and `@openrouter/sdk` rather than making network calls. The
`ai.transcribe` suite covers the empty-base64 and uri-only-empty recordings that
resolve the "no words" sentence without any network request.

## Lint

```bash
bun run lint       # eslint .
```

`eslint.config.mjs` uses `eslint-config-expo/flat.js` and ignores `dist/*`,
`.expo/*`, `src/lib/core/borel/*`, and the five Borel-managed files by path
(`src/index.tsx`, `src/lib/core/db.ts`, `src/lib/core/auth.tsx`,
`src/lib/core/legal.tsx`, `src/lib/ui/fonts.tsx`). The implementation in
`src/lib/core/db/` and `src/lib/core/auth/` is linted.

## Typecheck

```bash
bun run typecheck  # tsc --noEmit
```

`tsconfig.json` extends `expo/tsconfig.base`, sets `strict: true`, includes all
`.ts`/`.tsx`, and adds `jest` to `types`.

## Configuration

Environment variables are read from `EXPO_PUBLIC_*` values (Expo inlines them
with static dot access only). `.env.example` lists the full set:

- Borel: `EXPO_PUBLIC_DATA_API_URL`, `EXPO_PUBLIC_AUTH_URL`,
  `EXPO_PUBLIC_PREVIEW_AUTH_URL`, `EXPO_PUBLIC_BOREL_STORAGE`,
  `EXPO_PUBLIC_BOREL_AI`, `EXPO_PUBLIC_BOREL_ACCOUNT`, `EXPO_PUBLIC_BOREL_APPLE`,
  `EXPO_PUBLIC_BOREL_USAGE_URL`, `EXPO_PUBLIC_BOREL_INVITE_URL`
- `EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE` (`"true"` to offer Apple sign-in)
- `EXPO_PUBLIC_OPENROUTER_API_KEY` (chat and speech-to-text)

A local `.env` exists and is git-ignored. Missing `EXPO_PUBLIC_OPENROUTER_API_KEY`
makes `ai.chat` and `ai.transcribe` resolve the neutral error without a request.

## Build and release

There is no build script in `package.json` and no EAS config file. `app.json`
holds the Expo config (name, slug, icon/splash, plugins, `newArchEnabled: true`)
and ships placeholder identifiers `com.example.robintalks`. The root `README.md`
says to change the bundle identifier, replace the assets, and build with
`bunx eas build`. `dist/` and `.expo/` are generated output and git-ignored.

## Backend scaffold (`apps/backend`)

A separate, standalone Hono app, not wired to the mobile app. Its workflow is
documented in the root `README.md` and needs the Vercel CLI installed globally:

```bash
npm install
vc dev        # develop locally, http://localhost:3000
vc build      # build locally
vc deploy     # deploy
```

`package.json` names the package `hono` and depends on `hono ^4.13.13`;
`tsconfig.json` targets ESNext/NodeNext in strict mode with
`jsxImportSource: hono/jsx`. There is no root `package.json` or `turbo.json` in
the repository despite the monorepo commit message.

## Spec workflow

- sdd/pdd artifacts: `docs/agent-docs/specs/` and `docs/agent-docs/plans/`.
- The earlier `openspec/` directory was removed.

These are working artifacts, not documentation pages.
