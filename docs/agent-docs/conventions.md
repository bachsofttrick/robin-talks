# Conventions

Observed patterns in the source. Most are descriptive, not enforced by tooling: ESLint (flat config in `eslint.config.mjs`, base rules from `eslint-config-expo`) covers linting, but there is no formatter configured.

## File layout and naming

- Source files live under `src/`, organized into `src/lib/` (api, core, ui, polyfills), `src/navigation/`, and `src/screens/`. Root-level files (`index.tsx`, `expo-entry.js`, `borel-store.js`, `borel-systemui.js`) stay at the project root. Imports are relative (`./`, `../`).
- Components are one per file with PascalCase names (`Button.tsx`, `Screen.tsx`). Hooks and non-component modules are camelCase (`useProfile.tsx`, `scenarios.ts`).
- Every feature directory has an `index.tsx` entry: `src/screens/`, `src/navigation/`, `src/lib/api/`, `src/lib/ui/`, `src/lib/ui/ErrorHandler/`, and each screen folder (`src/screens/Session/index.tsx`).
- Barrels re-export the public surface: `src/lib/api/index.tsx`, `src/lib/ui/index.tsx`, `src/screens/index.tsx`, `src/navigation/index.tsx`.

## Borel-generated files

Three files carry the header `// Managed by Borel. This file is generated and kept in sync automatically.` and should not be hand-edited: `src/lib/core/db.ts:1-2`, `src/lib/core/auth.tsx:1-2`, `src/lib/core/legal.tsx:1-2`. The `src/lib/core/db/` and `src/lib/core/auth/` submodules are app-written and can be edited freely; only the `db.ts` and `auth.tsx` connectors are regenerated.

`index.tsx:9-13`, `src/lib/ui/fonts.tsx:10-15`, and several `src/lib/ui/` components note that they were "Written by Borel" and may be rewritten. A custom root can be protected by placing `// borel: custom entry` at the top of the file (`index.tsx:12`).

## Styling

- All visual constants come from `src/lib/ui/theme.ts`. Screens spread `type.*` presets and read `colors`, `spacing`, `radius`, `fonts`, and `components` rather than hard-coding values.
- Style objects are defined in a single `StyleSheet.create` at the bottom of each screen file.
- The one exception is the auth kit, which defines a local `KIT` colour object (`src/lib/core/auth/constants.ts`) and uses it throughout `src/lib/core/auth/` because the top-level `auth.tsx` is Borel-managed.
- Icons use one stroke width, `iconStroke` = 2 (`src/lib/ui/theme.ts:59`).
- Motion uses the shared hooks in `src/lib/ui/motion.ts` (`useEnter`, `useStagger`, `usePress`) driven by `brand.motion`.

## Data hooks

Hooks in `src/lib/api/` share a common shape: they return `{ data, loading, error, ...actions }`, and failed `db.from` calls are routed through `plainError` (`src/lib/api/useProfile.tsx:58`, `src/lib/api/useSessions.tsx:56`, `src/lib/api/useMemory.tsx:34`). Data access is always `db.from("<table>")` with the user id from `useAuth()`. Shared state goes through the typed `createAppStore` wrapper in `src/lib/api/store.ts:21-42`; stores are module-scope, non-persisted, and reset on account change.

## Tests

- Unit tests are colocated beside the module as `*.test.ts` (11 suites, 87 tests) and run with `bun run test` (`package.json:12`, `package.json:64-66`).
- Commands run with Bun.
- Pure testable modules never import the runtime `src/lib/core/db`; they use `import type` for its types and receive data or callbacks from callers. Examples: `src/lib/api/robinPrompt.ts:1-2`, `src/lib/api/robinTools.ts:1`, `src/lib/api/robinAgent.ts:1-2`, `src/lib/api/profileImport.ts:1`. The runtime import lives at the port boundary: `src/lib/api/sessionReader.ts:1`, `src/lib/api/useRobin.tsx:2-3`.

## Error and user-facing strings

- Every error shown to a user is one plain, non-technical sentence with a leading capital and terminal punctuation. `src/lib/core/db.ts` enforces this by testing candidate strings in `looksPlain` (`src/lib/core/db.ts:103-132`) and by keeping the technical reason in a separate `detail` field.
- `Notice` shows `message` directly and hides `detail` behind a "Details" tap (`src/lib/ui/Notice.tsx:22-38`).
- Comments in `src/lib/core/db.ts` and the auth kit cite App Store Review Guidelines (5.1.2(i) for AI consent at `src/lib/core/db.ts:162-169`; 1.2 for moderation at `:889-893`; 5.1.1(v) for account deletion at `src/lib/core/auth/actions.ts`, `src/lib/core/auth/AccountPanel.tsx`, and `src/lib/core/auth/RequireAccount.tsx`). These are the reasons for several behaviors and should not be removed casually.

## TypeScript

- `strict: true` is set in `tsconfig.json:4`; the config extends `expo/tsconfig.base` and includes all `.ts`/`.tsx` files.
- There are no path aliases; all imports are relative.

## Platform branching

Code that behaves differently on web distinguishes the browser preview with `const IN_BROWSER = typeof document !== "undefined"` (`src/lib/core/db.ts:41`), the auth kit's `IN_PREVIEW` (`src/lib/core/auth/constants.ts`), and inline `typeof document !== "undefined"` guards in `src/lib/core/auth/actions.ts` and `src/lib/core/auth/SignInFlow.tsx`. This is used where the preview has a brokered session and native does not.
