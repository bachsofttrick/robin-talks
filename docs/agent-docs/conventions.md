# Conventions

Observed patterns in the source. Most are descriptive, not enforced by tooling: ESLint (flat config in `eslint.config.mjs`, base rules from `eslint-config-expo`) covers linting, but there is no formatter configured.

## File layout and naming

- Source files live at the repository root, not under `src/`. Imports are relative (`./`, `../`). The README explains this is the layout the code was written against so Metro needs no extra configuration (`README.md:31-34`).
- Components are one per file with PascalCase names (`Button.tsx`, `Screen.tsx`). Hooks and non-component modules are camelCase (`useProfile.tsx`, `scenarios.ts`).
- Every feature directory has an `index.tsx` entry: `screens/`, `navigation/`, `api/`, `ui/`, `ui/ErrorHandler/`, and each screen folder (`screens/Session/index.tsx`).
- Barrels re-export the public surface: `api/index.tsx`, `ui/index.tsx`, `screens/index.tsx`, `navigation/index.tsx`.

## Borel-generated files

Three files carry the header `// Managed by Borel. This file is generated and kept in sync automatically.` and should not be hand-edited: `core/db.ts:1-2`, `core/auth.tsx:1-2`, `core/legal.tsx:1-2`.

`index.tsx:9-13`, `ui/fonts.tsx:10-15`, and several `ui/` components note that they were "Written by Borel" and may be rewritten. A custom root can be protected by placing `// borel: custom entry` at the top of the file (`index.tsx:12`).

## Styling

- All visual constants come from `ui/theme.ts`. Screens spread `type.*` presets and read `colors`, `spacing`, `radius`, `fonts`, and `components` rather than hard-coding values.
- Style objects are defined in a single `StyleSheet.create` at the bottom of each screen file.
- The one exception is `core/auth.tsx`, which defines a local `KIT` colour object because it is regenerated (`core/auth.tsx:414-422`).
- Icons use one stroke width, `iconStroke` = 2 (`ui/theme.ts:59`).
- Motion uses the shared hooks in `ui/motion.ts` (`useEnter`, `useStagger`, `usePress`) driven by `brand.motion`.

## Data hooks

Hooks in `api/` share a common shape: they return `{ data, loading, error, ...actions }`, and failed `db.from` calls are routed through `plainError` (`api/useProfile.tsx:58`, `api/useSessions.tsx:56`, `api/useMemory.tsx:34`). Data access is always `db.from("<table>")` with the user id from `useAuth()`. Shared state goes through the typed `createAppStore` wrapper in `api/store.ts:21-42`; stores are module-scope, non-persisted, and reset on account change.

## Tests

- Unit tests are colocated beside the module as `*.test.ts` (8 suites, 61 tests) and run with `bun run test` (`package.json:12`, `package.json:64-66`).
- Commands run with Bun.
- Pure testable modules never import the runtime `core/db`; they use `import type` for its types and receive data or callbacks from callers. Examples: `api/robinPrompt.ts:1-2`, `api/robinTools.ts:1`, `api/robinAgent.ts:1-2`, `api/profileImport.ts:1`. The runtime import lives at the port boundary: `api/sessionReader.ts:1`, `api/useRobin.tsx:2-3`.

## Error and user-facing strings

- Every error shown to a user is one plain, non-technical sentence with a leading capital and terminal punctuation. `core/db.ts` enforces this by testing candidate strings in `looksPlain` (`core/db.ts:103-132`) and by keeping the technical reason in a separate `detail` field.
- `Notice` shows `message` directly and hides `detail` behind a "Details" tap (`ui/Notice.tsx:22-38`).
- Comments in `core/db.ts` and `core/auth.tsx` cite App Store Review Guidelines (5.1.2(i) for AI consent at `core/db.ts:162-169`; 1.2 for moderation at `:889-893`; 5.1.1(v) for account deletion at `core/auth.tsx:246`, `:929-931`). These are the reasons for several behaviors and should not be removed casually.

## TypeScript

- `strict: true` is set in `tsconfig.json:4`; the config extends `expo/tsconfig.base` and includes all `.ts`/`.tsx` files.
- There are no path aliases; all imports are relative.

## Platform branching

Code that behaves differently on web distinguishes the browser preview with `const IN_BROWSER = typeof document !== "undefined"` (`core/db.ts:41`, `core/auth.tsx:523`). This is used where the preview has a brokered session and native does not.
