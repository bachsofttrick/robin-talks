# Conventions

Patterns observed across the source. Follow them when editing.

## Borel-managed files

Files whose first line is `// Managed by Borel.` are generated and rewritten by
the Borel backend tool; do not hand-edit them:

- `src/lib/core/db.ts`
- `src/lib/core/auth.tsx`
- `src/lib/core/legal.tsx`
- `src/index.tsx`
- `src/lib/ui/fonts.tsx`

The two root bridges, `borel-store.js` and `borel-systemui.js`, are vendor code
as well. A file starting with `// borel: custom entry` is left alone by
regeneration, but none of the current files use that marker. Put app logic
outside these files.

## Connector + submodule shape

`db.ts` and `auth.tsx` are thin connectors: they keep the managed header and
re-export the public surface from a sibling folder (`db/`, `auth/`). The 1,983
line `db.ts` and 1,076 line `auth.tsx` were split into single-concern modules
(the plans in `docs/agent-docs/plans/260930-db-split` and `260930-auth-split`
record the move). Preserve this shape: add a new concern as a new submodule and
re-export it from the connector.

## Imports

- Import from a local barrel where one exists: `../ui`, `../api`, `../core/db`,
  `../core/auth`, `../navigation`.
- Within a subfolder, use relative imports (`./config`, `./errors`).
- Root bridges are reached with `../../../borel-store` / `../../../borel-systemui`
  from `src/lib/...` files.

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
  `plainError(error, "save" | "load")`; AI failures through the mappings in
  `src/lib/core/db/ai.ts` and `errors.ts`. Technical text belongs in a separate
  `detail` field. `looksPlain` (`src/lib/core/db/errors.ts`) gates any message
  the API itself supplies.
- The `Notice` component renders that sentence above the content and can reveal
  `detail` behind a "Details" tap.

## State

- Shared or persisted UI state uses `createStore` from `borel-store.js`
  (module singleton, `useSyncExternalStore`), not React Context. React Context is
  used only for auth (`AuthProvider`).
- Domain hooks return `{ data, loading, error, ...actions }` and read the user
  from `useAuth()`.
- Screens never call `db` directly, except the `db.ai.transcribe` call in
  `src/screens/Session/index.tsx`.
- State is kept local to a screen unless another screen needs it.

## Styling

- Read colours, spacing, radius, fonts, and type from `src/lib/ui/theme.ts`.
  Screens build `StyleSheet.create` objects at the bottom of the file.
- Icons come from `lucide-react-native`, sized per use and stroked with
  `iconStroke`.
- Account screens use the auth kit's own `KIT` palette instead of the app theme.

## Data and privacy

- Raw audio is never stored. Only the transcript and debrief reach the database.
- Every AI call asks for consent first, once per company and per kind.
- Database access is always scoped to the signed-in user; row-level security on
  Borel enforces the same.

## Specs and changes

OpenSpec (`openspec/`) is the spec workflow: changes live in
`openspec/changes/` and synced specs in `openspec/specs/`. The sdd/pdd working
artifacts live under `docs/agent-docs/specs/` and `docs/agent-docs/plans/`.
Neither folder is a documentation page set.

## Considered but not present

- No `src/lib/api/store.ts`, `robinPrompt.ts`, `robinAgent.ts`, or
  `screens/Session/useTurnRecorder.ts` exist, despite mentions in `README.md`.
  The current AI path is a single `db.ai.chat` call from `useRobin`.
- `@supabase/supabase-js` is listed in `package.json` but not imported anywhere
  in `src/`.
