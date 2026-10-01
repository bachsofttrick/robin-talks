# Workflows

Commands below are taken from `package.json`, `README.md`, and `app.json`. Nothing is inferred.

## Install

```
bun install
```

`README.md` documents `bun install` and requires Node.js 20 or newer; `bunx expo` fetches the Expo CLI on demand. A `bun.lock` file is present at the root.

## Run

```
bunx expo start
```

Scripts in `package.json:6-14`:

| Command | Effect |
|---|---|
| `bun start` | `expo start` |
| `bun run ios` | `expo start --ios` |
| `bun run android` | `expo start --android` |
| `bun run web` | `expo start --web` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | `eslint .` with the `eslint-config-expo` flat config |
| `bun run test` | `jest` with the `jest-expo` preset |

`README.md` describes scanning the QR code with Expo Go, or pressing `i`, `a`, or `w`. The app entry is `expo-entry.js` (`package.json:5`).

## Typecheck

```
bun run typecheck
```

Runs `tsc --noEmit` against `tsconfig.json`.

## Test

```
bun run test
```

`package.json:13` defines `"test": "jest"` with the `jest-expo` preset (`package.json:67-69`). Test dependencies are `jest`, `jest-expo`, and `@types/jest` (`package.json:56-66`). Unit tests live beside the module as `*.test.ts` (11 suites, 87 tests): `src/lib/api/store.test.ts`, `src/lib/api/profileImport.test.ts`, `src/lib/api/robinPrompt.test.ts`, `src/lib/api/robinTools.test.ts`, `src/lib/api/robinAgent.test.ts`, `src/lib/api/scenarios.test.ts`, `src/lib/polyfills/responsePolyfill.test.ts`, `src/lib/core/auth/errors.test.ts`, `src/lib/core/auth/labels.test.ts`, `src/screens/Session/voiceActivity.test.ts`, `src/navigation/rootRoute.test.ts`.

## Lint

```
bun run lint
```

`package.json:12` defines `"lint": "eslint ."`. The flat config in `eslint.config.mjs` spreads `eslint-config-expo/flat` (SDK 57) and ignores build output (`dist/`, `.expo/`) plus Borel-managed/generated sources (`src/lib/core/`, `borel-store.js`, `borel-systemui.js`), which cannot be fixed here because they are regenerated. Dev dependencies are `eslint` 9 and `eslint-config-expo` (`package.json:61-62`). Note: ESLint 10 is not usable here because the bundled `eslint-plugin-react` 7.x supports ESLint up to 9.x.

Lint is clean: `bun run lint` exits 0. Past findings fixed during adoption were `react-hooks/refs` in `src/lib/ui/motion.ts` (now `useState` initializers for the stable `Animated.Value`s), `react-hooks/set-state-in-effect` in fetch-on-mount and session-sync effects (state updates deferred to a microtask continuation; `src/screens/Session/index.tsx` also destructures the stable `sessions.fetchOne`/`sessions.reload` callbacks for honest deps), plus `@typescript-eslint/array-type` (`readonly T[]` form), one unused `DarkTheme` import, and one `react-hooks/exhaustive-deps` fix.

## CI/CD

There is no CI/CD configuration. No `.github/`, `.gitlab-ci.yml`, `eas.json`, or equivalent is present. `README.md` suggests `bunx eas build` for store builds, but no EAS config file exists in the repository.

## Native builds and in-app purchases

`README.md` states StoreKit does not exist in Expo Go, so real in-app purchases require a development build (`bunx expo run:ios`) or TestFlight. `app.json` lists `expo-apple-authentication`, `expo-audio`, `expo-image-picker`, and `expo-notifications` under `plugins` (`app.json:29-45`); `expo-iap` is a dependency and is loaded lazily by `borel-systemui.js:721`, but it is not listed in `app.json` plugins.

## Environment variables

No `.env`, `.env.local`, or example file exists. `.gitignore:12-13` ignores `.env` and `.env.local`. Backend URLs are hard-coded string constants in `src/lib/core/db.ts:16-24` rather than environment variables.

## Store-publishing notes from the README

`README.md` lists remaining manual steps: change the placeholder bundle identifier `com.example.robintalks` in `app.json:17`/`:20`, replace the assets in `assets/`, and build with EAS. `README.md` notes that IAP products must exist in the owner's App Store Connect account and that `extra.borelIap` in `app.json` maps slugs to product ids; that `extra` block is not present in the current `app.json`.
