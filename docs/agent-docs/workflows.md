# Workflows

Source paths are relative to `apps/mobile/` unless noted.

Repo-wide commands run from the repository root and fan out through Turborepo.
Per-workspace commands still work when run inside a workspace.

## Root scripts

The root `package.json` is private (`robin-talks-monorepo`), declares
`"workspaces": ["apps/*"]` and `"packageManager": "bun@1.4.2"`, and maps every
task to `turbo run <task>`:

| Root command | Runs |
|---|---|
| `bun install` | One install for both workspaces (there is no per-workspace install) |
| `bun run dev` | `turbo run start`; the Expo app names its task `start`, not `dev` |
| `bun run lint` | `turbo run lint` |
| `bun run typecheck` | `turbo run typecheck` |
| `bun run test` | `turbo run test` |
| `bun run build` | `turbo run build` |
| `bun run env:link` | `bun scripts/link-env.mjs` |

`turbo.json` declares `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**"]`),
`typecheck`, `lint`, and `test` (each `dependsOn: ["^<same task>"]`), `start`
(`cache: false`, `persistent: true`, `dependsOn: ["//#env:link"]`), and the root
task `//#env:link`. `agentGuidance: false` is deliberate: without it Turborepo
rewrites `AGENTS.md`, and `AGENTS.md` is a symlink to `CLAUDE.md`.

Verified after clearing the `.turbo` caches: `bun run lint`, `bun run typecheck`,
`bun run test`, and `bun run build` at the root all exit 0.

## Install

```bash
bun install
```

Run it once at the repository root. Add a dependency with `bun add <pkg>` from the
root; the only lockfile is the root `bun.lock`. The per-workspace `bun.lock` files
and `apps/backend/pnpm-workspace.yaml` were removed. The root `README.md` states
Node.js 20 or newer is required (Expo fetches its CLI on demand with `bunx expo`).

Two root config choices exist only to keep the hoisted install working:

- `bunfig.toml` sets `[install] linker = "hoisted"`. Bun 1.4 defaults a new
  workspace to the isolated linker, whose `node_modules/.bun` store path defeats
  the mobile Jest `transformIgnorePatterns` allow-list, which only matches paths
  under `/node_modules/`.
- The root pins `typescript: "~6.0.3"` so hoisted `@typescript-eslint` and
  `ts-api-utils` resolve a TypeScript whose API they support. `apps/backend` keeps
  `typescript@7.0.2` nested in its own `node_modules` for its build.

Both workspaces therefore have a `node_modules` directory holding only
`typescript`; everything else resolves from the root `node_modules`.

## Environment files

The root `.env` and `.env.example` are the only real env files.
`apps/mobile/.env` and `apps/backend/.env` are relative symlinks to `../../.env`,
created and refreshed by:

```bash
bun run env:link
```

`scripts/link-env.mjs` is idempotent: it prints nothing when a link is already
correct, replaces a wrong link or a real file, and exits 0 with a message when the
root `.env` is absent. `turbo run start` depends on `//#env:link`, so `bun run dev`
refreshes the links before Expo starts.

This works because Bun resolves dotenv paths against the current working directory
and Expo applies standard dotenv rules rooted at the app directory; neither
searches parent directories on its own. EAS remote builds upload only the app
directory, so the root `.env` never reaches them; `EXPO_PUBLIC_*` values for EAS
come from EAS environment variables.

## Run

```bash
bun start          # ELECTRON_DISABLE_SANDBOX=1 expo start
bun run android    # expo start --android
bun run ios        # expo start --ios
bun run web        # expo start --web
```

These run from `apps/mobile`; `bun run dev` at the root is the equivalent.

`package.json` sets `"main": "expo-entry.js"`, so Expo boots through
`expo-entry.js` (polyfills, `SafeAreaProvider`) and then `src/index.tsx`.
Voice recording, text-to-speech, and microphone permissions need a real device or
simulator; the web preview is the weakest target for the voice loop.

## Test

From the root, `bun run test` runs `turbo run test`; inside `apps/mobile` it is:

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

Current totals: 5 suites, 56 tests. Only `apps/mobile` has a test script, so root
`bun run test` runs just that workspace. Tests mock `./config`, `./notify`,
`./consent`, and `@openrouter/sdk` rather than making network calls. The
`ai.transcribe` suite covers the empty-base64 and uri-only-empty recordings that
resolve the "no words" sentence without any network request.

## Lint

`apps/backend` has no ESLint config, so root `bun run lint` covers
`apps/mobile` only. Inside `apps/mobile`:

```bash
bun run lint       # eslint .
```

`eslint.config.mjs` uses `eslint-config-expo/flat.js` and ignores `dist/*`,
`.expo/*`, `src/lib/core/borel/*`, and the five Borel-managed files by path
(`src/index.tsx`, `src/lib/core/db.ts`, `src/lib/core/auth.tsx`,
`src/lib/core/legal.tsx`, `src/lib/ui/fonts.tsx`). The implementation in
`src/lib/core/db/` and `src/lib/core/auth/` is linted.

## Typecheck

Root `bun run typecheck` runs both workspaces. Inside `apps/mobile`:

```bash
bun run typecheck  # tsc --noEmit
```

`tsconfig.json` extends `expo/tsconfig.base`, sets `strict: true`, includes all
`.ts`/`.tsx`, and adds `jest` to `types`.

## Configuration

Environment variables are read from `EXPO_PUBLIC_*` values (Expo inlines them
with static dot access only). The root `.env.example` lists the full set:

- Borel: `EXPO_PUBLIC_DATA_API_URL`, `EXPO_PUBLIC_AUTH_URL`,
  `EXPO_PUBLIC_PREVIEW_AUTH_URL`, `EXPO_PUBLIC_BOREL_STORAGE`,
  `EXPO_PUBLIC_BOREL_AI`, `EXPO_PUBLIC_BOREL_ACCOUNT`,
  `EXPO_PUBLIC_BOREL_USAGE_URL`, `EXPO_PUBLIC_BOREL_INVITE_URL`
- `EXPO_PUBLIC_OPENROUTER_API_KEY` (chat and speech-to-text)

The root `.env` exists, is git-ignored, and is shared through the two workspace
symlinks described above. Missing `EXPO_PUBLIC_OPENROUTER_API_KEY`
makes `ai.chat` and `ai.transcribe` resolve the neutral error without a request.

## Build and release

`apps/mobile` has no build script, and no EAS config file exists. `app.json`
holds the Expo config (name, slug, icon/splash, plugins, `newArchEnabled: true`)
and ships placeholder identifiers `com.example.robintalks`. The root `README.md`
says to change the bundle identifier, replace the assets, and build with
`bunx eas build`. `dist/` and `.expo/` are generated output and git-ignored.

## Backend scaffold (`apps/backend`)

A separate, standalone Hono app, package `@robin-talks/backend`, not wired to the
mobile app. It takes part in the root install and in the root Turbo tasks, so no
separate install step exists:

```bash
bun run dev        # bun run --hot src/index.ts, http://localhost:3000
bun run typecheck  # tsc --noEmit
bun run build      # tsc, emits dist/index.js
```

The first is `apps/backend`-only; `bun run typecheck` and `bun run build` also run
from the repository root.

The `build` and `typecheck` tasks run under TypeScript `7.0.2`, nested in
`apps/backend/node_modules`. `tsconfig.json` targets ESNext/NodeNext in strict mode
with `jsxImportSource: hono/jsx` and `outDir: dist`. There is no lint task for
this workspace (no ESLint config) and no test task.

## Spec workflow

- sdd/pdd artifacts: `docs/agent-docs/specs/` and `docs/agent-docs/plans/`.
- The earlier `openspec/` directory was removed.

These are working artifacts, not documentation pages.
