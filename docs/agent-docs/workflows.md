# Workflows

Commands are taken from `package.json`, `eslint.config.mjs`, and the Jest config
block in `package.json`. Bun is the package manager (`bun.lock` is present).

## Install

```bash
bun install
```

Add a dependency with `bun add <pkg>`; the lockfile is `bun.lock`. `README.md`
states Node.js 20 or newer is required (Expo fetches its CLI on demand with
`bunx expo`).

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
| `src/lib/core/db/ai.test.ts` | chat transport, error mapping, JSON retry, photo encoding, transcribe |
| `src/lib/core/db/consent.test.ts` | consent wording/keys and the ask-once flow |
| `src/lib/core/auth/errors.test.ts` | `authErrorMessage` translation |
| `src/lib/core/auth/labels.test.ts` | `labelsWith` overrides |
| `src/lib/polyfills/responsePolyfill.test.ts` | `Response.json` polyfill |

Current totals: 5 suites, 53 tests. Tests mock `./config`, `./notify`,
`./consent`, and `@openrouter/sdk` rather than making network calls.

## Lint

```bash
bun run lint       # eslint .
```

`eslint.config.mjs` uses `eslint-config-expo/flat.js` and ignores `dist/*`,
`.expo/*`, `core/*`, `borel-store.js`, and `borel-systemui.js`. Note the
`core/*` pattern does not match the generated files under `src/lib/core/`, so
those files are still linted despite the config comment.

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
and ships placeholder identifiers `com.example.robintalks`. `README.md` says to
change the bundle identifier, replace the assets, and build with
`bunx eas build`. `dist/` and `.expo/` are generated output and git-ignored.

## Spec workflow

- OpenSpec: changes under `openspec/changes/` and synced specs under
  `openspec/specs/`; config is `openspec/config.yaml`.
- sdd/pdd artifacts: `docs/agent-docs/specs/` and `docs/agent-docs/plans/`.

These are working artifacts, not documentation pages.
