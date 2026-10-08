# Conventions

Source paths are relative to `apps/mobile/` unless noted.

Patterns observed across the source. Follow them when editing.

## Borel-managed files

Files whose first line is `// Managed by Borel.` are generated and rewritten by
the Borel backend tool; do not hand-edit them:

- `src/lib/core/db.ts`
- `src/lib/core/auth.tsx`
- `src/lib/core/legal.tsx`
- `src/index.tsx`
- `src/lib/ui/fonts.tsx`

The two Borel bridges under `src/lib/core/borel/`, `borel-store.js` and
`borel-systemui.js`, are vendor code as well. A file starting with
`// borel: custom entry` is left alone by regeneration, but none of the current
files use that marker. Put app logic outside these files.

## Connector + submodule shape

`db.ts` and `auth.tsx` are thin connectors: they keep the managed header and
re-export the public surface from a sibling folder (`db/`, `auth/`). The 1,983
line `db.ts` and 1,076 line `auth.tsx` were split into single-concern modules
(the plans in `docs/agent-docs/plans/260930-db-split` and `260930-auth-split`
record the move). Preserve this shape: add a new concern as a new submodule and
re-export it from the connector.

## Imports

- Import from a local barrel where one exists: `../ui`, `../core/db`,
  `../core/auth`, `../core/legal`, `../navigation`.
- `src/lib/api/` is the exception: screens and the navigator import the module
  they need (`../../lib/api/useSessions`, `../../lib/api/scenarios`). The
  `src/lib/api/index.tsx` barrel exports the same surface and nothing imports it
  yet.
- Within a subfolder, use relative imports (`./config`, `./errors`).
- The Borel bridges are reached relatively: `../core/borel/borel-store` from
  `src/lib/api/`, and `../borel/borel-systemui` from `src/lib/core/auth/`.

## Naming

- Components and screens: `PascalCase` files under feature folders
  (`Session/index.tsx`, `SignInFlow.tsx`).
- Hooks: `useThing.tsx` in `src/lib/api/`.
- Store keys: `robin.<area>` (for example `robin.profile`).
- Event handlers: `on` prefix (`onPress`, `onChangeText`); local actions use
  verbs (`advance`, `finish`, `reload`, `save`).

## Error handling

- User-facing failures are exactly one plain, non-technical sentence with a
  leading capital and terminal punctuation. DB failures go through
  `plainError(error, "save" | "load")`; AI failures map in the backend's
  `src/lib/ai/functions.ts` (provider codes, shared by the `src/routes/ai/`
  sub-routers) and the thin client's
  `src/lib/core/db/ai.ts` (transport). Technical text belongs in a separate
  `detail` field. `looksPlain` (`src/lib/core/db/errors.ts`) gates any message
  the API itself supplies.
- The `Notice` component renders that sentence above the content and can reveal
  `detail` behind a "Details" tap.

## State

- Shared or persisted UI state uses `createStore` from
  `src/lib/core/borel/borel-store.js` (module singleton, `useSyncExternalStore`),
  not React Context. React Context is used only for auth (`AuthProvider`).
- Domain hooks return `{ data, loading, error, ...actions }` and read the user
  from `useAuth()`.
- Screens never call `db` directly, except the `db.ai.transcribe` call in
  `src/screens/Session/index.tsx`.
- State is kept local to a screen unless another screen needs it.

## Effects and the React Compiler lint

`eslint-config-expo` pulls in `eslint-plugin-react-hooks` v7, whose compiler
rules (`immutability`, `set-state-in-effect`, `purity`) shape the code. Four
patterns in the source exist to satisfy them. Keep them when adding effects:

- An async wrapper inside `useEffect` keeps `reload`'s state updates off the
  effect's synchronous path. The comment above each one says so
  (`src/lib/api/useProfile.tsx:54-60`, `useSessions.tsx:61-67`,
  `useMemory.tsx:38-44`, `src/screens/Session/index.tsx:70-81, 89-110, 237-244`).
- A callback used by an effect is declared above it, because a forward reference
  trips the immutability lint. In the Session screen `finish` is declared before
  `advance` for this reason (`src/screens/Session/index.tsx:163-164`).
- An effect that awaits something keeps an `active` flag and returns a cleanup
  that clears it, so state updates never land on an unmounted screen
  (`src/screens/Session/index.tsx:89-110`).
- Hook objects are destructured into named callbacks before an effect depends on
  them, so the effect re-runs on a stable identity rather than on a fresh hook
  return value (`src/screens/Session/index.tsx:33-41`).

## Styling

- Read colours, spacing, radius, fonts, and type from `src/lib/ui/theme.ts`.
  Screens build `StyleSheet.create` objects at the bottom of the file.
- Icons come from `lucide-react-native`, sized per use and stroked with
  `iconStroke`.
- Account screens use the auth kit's own `KIT` palette instead of the app theme.

## Data and privacy

- Raw audio is never stored. Only the transcript and debrief reach the database.
- Every AI call asks for consent first, once per company and per kind.
- Database access is always scoped to the signed-in user; the backend's
  `/api/data/*` router enforces it for the app's tables.

## Specs and changes

The spec-driven workflow keeps its artifacts under `docs/agent-docs/specs/`
(sdd) and `docs/agent-docs/plans/` (pdd). Neither folder is a documentation
page set. The earlier `openspec/` directory was removed.

## Considered but not present

- `src/lib/api/` holds `scenarios`, `useProfile`, `useSessions`, `useMemory`, and
  `useRobin`. The agent-loop modules from an earlier version (`store.ts`,
  `profileImport.ts`, `robinPrompt.ts`, `robinAgent.ts`, `robinTools.ts`,
  `sessionReader.ts`), `src/screens/Session/useTurnRecorder.ts`,
  `src/screens/Session/voiceActivity.ts`, and `src/navigation/rootRoute.ts` were
  removed in `d84e198`. The AI path is one `db.ai.chat` call per turn or debrief
  from `useRobin`, the Session screen owns the recorder, and the root navigator
  decides its screen inline.
- `@supabase/supabase-js` is listed in `package.json` but not imported anywhere
  in `src/`.
- `eslint.config.mjs` ignores the five Borel-managed files by path, so
  `bun run lint` reports nothing on them. The `db/` and `auth/` submodules are
  linted.
