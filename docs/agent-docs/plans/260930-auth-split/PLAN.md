# Plan: Split auth.tsx into focused modules

Status: approved
Request: split src/lib/core/auth.tsx into multiple human-readable files in a folder, keeping the original file as connector

## Approach

`src/lib/core/auth.tsx` is 1,076 lines and carries four separate concerns: the auth contracts and error translation, the async auth calls against Borel, the React session provider/hook, and the account UI kit (labels, primitives, and the four screens). Split it into single-concern modules under a new `src/lib/core/auth/` folder, and reduce `src/lib/core/auth.tsx` to a thin connector that re-exports the same public surface. This mirrors the existing `db.ts` + `db/` split: the Borel-managed top-level file stays put and keeps its header, the new subfolder is not Borel-managed, and every function, type, and string is moved verbatim with only its relative import path adjusted. Consumers keep importing from `../core/auth` unchanged.

## Affected Code

- `src/lib/core/auth.tsx` - reduced to the Borel header plus explicit re-exports of the public API (the connector the request asks to keep)
- `src/lib/core/auth/types.ts` (new) - `User`, `Session`, `AuthResult`
- `src/lib/core/auth/constants.ts` (new) - `AUTH_REDIRECT_URL`, `APPLE_IN_PREVIEW`, `WRONG_CURRENT_PASSWORD`, `APPLE_SIGN_IN_AVAILABLE`, `PASSWORD_RESET_AVAILABLE`, `MANAGE_SUBSCRIPTIONS_URL`, `IN_PREVIEW`, `KIT`, `APPLE_LOGO_PATH`
- `src/lib/core/auth/errors.ts` (new) - `SUCCESS`, `failed`, `authErrorMessage`, `displayNameFor`, `madeWithoutSession`
- `src/lib/core/auth/actions.ts` (new) - `syncProfile`, `signUp`, `signIn`, `signOut`, `sendPasswordReset`, `resetPassword`, `confirmEmail`, `updatePassword`, `resendConfirmation`, `deleteAccount`, `signInWithApple`
- `src/lib/core/auth/context.tsx` (new) - `AuthState`, `AuthContextValue`, `AuthContext`, `AuthProvider`, `useAuth`, `useKitSession`
- `src/lib/core/auth/labels.ts` (new) - `AccountKitLabels`, `LABELS`, `labelsWith`
- `src/lib/core/auth/controls.tsx` (new) - `Field`, `PrimaryButton`, `LinkButton`, `AppleButton`, `Problem`, `Note`
- `src/lib/core/auth/SignInFlow.tsx` (new) - `SignInStep`, `SignInFlow`
- `src/lib/core/auth/SignInSheet.tsx` (new) - `SignInSheet`
- `src/lib/core/auth/RequireAccount.tsx` (new) - `RequireAccount`
- `src/lib/core/auth/AccountPanel.tsx` (new) - `AccountPanel`
- `src/lib/core/auth/errors.test.ts` (new) - tests for the pure error helpers
- `src/lib/core/auth/labels.test.ts` (new) - tests for `labelsWith`

No other file changes. External consumers (`src/lib/api/useRobin.tsx`, `useSessions.tsx`, `useMemory.tsx`, `useProfile.tsx`, `src/navigation/RootNavigator.tsx`, `src/screens/Practice/index.tsx`, `src/screens/Settings/index.tsx`, `src/lib/core/index.tsx`) keep importing `../core/auth` and resolve to the connector.

## Data Model and Contracts

No new data model and no behavior change. The public surface of `src/lib/core/auth.tsx` stays exactly the same:

- Constants: `AUTH_REDIRECT_URL`, `APPLE_IN_PREVIEW`, `APPLE_SIGN_IN_AVAILABLE`, `PASSWORD_RESET_AVAILABLE`
- Functions: `authErrorMessage`, `signUp`, `signIn`, `signOut`, `sendPasswordReset`, `resetPassword`, `confirmEmail`, `updatePassword`, `resendConfirmation`, `deleteAccount`, `signInWithApple`
- Hooks/components: `AuthProvider`, `useAuth`, `SignInFlow`, `SignInSheet`, `RequireAccount`, `AccountPanel`
- Types: `User`, `Session`, `AuthResult`, `AuthState`, `AuthContextValue`, `AccountKitLabels`, `SignInStep`

Internal helpers (`SUCCESS`, `failed`, `displayNameFor`, `madeWithoutSession`, `WRONG_CURRENT_PASSWORD`, `KIT`, `LABELS`, `labelsWith`, `IN_PREVIEW`, `useKitSession`, `Field`, `PrimaryButton`, `LinkButton`, `APPLE_LOGO_PATH`, `AppleButton`, `Problem`, `Note`, `syncProfile`) are exported from their submodule only where another submodule imports them, and are not re-exported by the connector.

Module dependency order (no cycles):

`types` + `constants` -> `errors`, `labels`, `controls` -> `actions` -> `context` -> `SignInFlow` -> `SignInSheet` -> `RequireAccount` -> `AccountPanel` -> connector.

## Libraries

- `react` 19.2.3: `createContext`, `useContext`, `useEffect`, `useMemo`, `useRef`, `useState` in `context.tsx` and `SignInFlow.tsx`. Usage is copied verbatim; docs checked via context7 (`/react/react/v19.2.8`), no API change.
- `react-native` 0.86.3: `ActivityIndicator`, `Linking`, `Modal`, `Platform`, `Pressable`, `ScrollView`, `Text`, `TextInput`, `View` across `controls.tsx`, `SignInFlow.tsx`, `SignInSheet.tsx`, `RequireAccount.tsx`, `AccountPanel.tsx`.
- `react-native-svg` 15.15.4: `Svg`, `Path` in `controls.tsx` for the Apple logo. Docs checked via context7 (`/software-mansion/react-native-svg`), no API change.
- `@neondatabase/neon-js` ^0.7.0: only reached indirectly through `../db`; not imported directly by any new file.

## Risks

- Borel regenerates `src/lib/core/auth.tsx` and overwrites the connector: same accepted risk as the `db.ts` split. Keep the "Managed by Borel" header on `auth.tsx` and keep the subfolder unmarked so only the connector is regenerated; the connector holds only imports and re-exports.
- Module resolution picks `auth.tsx` instead of `auth/index.tsx`: avoided by not creating an `auth/index.tsx`. `db.ts` + `db/` already relies on this and works.
- Circular imports between submodules: prevented by the strict order above. `context.tsx` imports `syncProfile` from `actions.ts`; `actions.ts` never imports `context.tsx`. `db/*` imports nothing from `core/auth`.
- Wrong relative import depth after the move: `../../../borel-systemui` in the original becomes `../../../../borel-systemui` from inside `auth/`; `./legal` becomes `../legal`; `./db` becomes `../db`. Called out per task and caught by typecheck.
- `errors.ts` name collides conceptually with `db/errors.ts`: different folders, no module conflict. `authErrorMessage` stays the only error-translation export consumed outside.
- Behavior drift while moving code: mitigated by moving each block verbatim, with comments, and making the only edits be `import`/`export` lines and relative paths.
