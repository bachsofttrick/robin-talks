# Tasks: Split auth.tsx into focused modules

Status: complete
Plan: PLAN.md

## Wave 1
No dependencies. Foundation types and constants.

- [x] T1: Extract auth contracts and constants (commit 932f6b3)
  - Files: `src/lib/core/auth/types.ts` (create), `src/lib/core/auth/constants.ts` (create)
  - Do: Create both files from `src/lib/core/auth.tsx`, moving blocks verbatim with their doc comments.
    - `types.ts`: `User` (lines 18-25), `Session` (27-31), `AuthResult` (33-45). Exports `User`, `Session`, `AuthResult`. `AuthResult` imports nothing; keep the `/** ... */` doc comments.
    - `constants.ts`: `AUTH_REDIRECT_URL` (16) with its doc comment; `APPLE_IN_PREVIEW` (259-260) with doc comment; `WRONG_CURRENT_PASSWORD` (213-215) with doc comment; `APPLE_SIGN_IN_AVAILABLE` (407-414) with doc comment; `PASSWORD_RESET_AVAILABLE` (426-427) with doc comment; `MANAGE_SUBSCRIPTIONS_URL` (429-430) with doc comment; `IN_PREVIEW` (524-525) with doc comment; `KIT` (416-424); `APPLE_LOGO_PATH` (631-635, include the explanatory comment).
    - Do not modify `auth.tsx` in this task. Do not create an `auth/index.tsx`.
  - Tests: none - type-only file plus constant values, verified by typecheck
  - Done when: both files exist with the listed exports and comments, no imports except none, and `bun run typecheck` passes.

## Wave 2
Depends on Wave 1 (`./types`, `./constants`).

- [x] T2: Extract error translation and labels
  - Files: `src/lib/core/auth/errors.ts` (create), `src/lib/core/auth/labels.ts` (create)
  - Do: Create both files from `auth.tsx`, verbatim except imports/exports.
    - `errors.ts` imports `import type { AuthResult } from "./types";`. Contains `SUCCESS` (47), `failed` (49-51), `authErrorMessage` (53-93, with its doc comment), `displayNameFor` (95-100), `madeWithoutSession` (143-146). Export all five.
    - `labels.ts` imports `import { WRONG_CURRENT_PASSWORD, APPLE_IN_PREVIEW } from "./constants";`. Contains `AccountKitLabels` interface (432-474), `LABELS` (476-518), `labelsWith` (520-522). Export `AccountKitLabels`, `LABELS`, `labelsWith`.
    - Do not modify `auth.tsx`.
  - Tests: `src/lib/core/auth/errors.test.ts` (create) - `authErrorMessage` for invalid-credentials, unconfirmed-email, invalid-code, already-exists, password-too-short, invalid-email, rate-limit, network, empty/unrecognised fallthrough; `displayNameFor` from metadata and from an email local part; `madeWithoutSession` for `session_not_found` and the "failed to retrieve user session" message. `src/lib/core/auth/labels.test.ts` (create) - `labelsWith()` returns the defaults reference; `labelsWith({ signIn: "x" })` overrides one key and keeps the rest.
  - Done when: both files exist; `bun run lint`, `bun run typecheck`, and the two new test files pass.

## Wave 3
Depends on Wave 1 (`./constants`).

- [x] T3: Extract account UI primitives
  - Files: `src/lib/core/auth/controls.tsx` (create)
  - Do: Create `controls.tsx` from `auth.tsx`. Imports: `{ ActivityIndicator, Pressable, Text, TextInput, View }` from `react-native`, `Svg, { Path }` from `react-native-svg`, and `{ KIT, APPLE_LOGO_PATH }` from `./constants`. Move verbatim `Field` (563-598), `PrimaryButton` (600-621), `LinkButton` (623-629), `AppleButton` (637-671, with its doc comment 637-641), `Problem` (673-676), `Note` (678-681). Export all six. Do not modify `auth.tsx`.
  - Tests: none - presentational components with no render-testing library installed in the project
  - Done when: file exists, exports the six components, and `bun run typecheck` passes.

## Wave 4
Depends on Waves 1-3 (`./types`, `./constants`, `./errors`).

- [x] T4: Extract auth actions
  - Files: `src/lib/core/auth/actions.ts` (create)
  - Do: Create `actions.ts` from `auth.tsx`. Imports: `{ db, authCall, adoptSession, appleCall }` from `../db`; `{ signInWithApple as appleSheet }` from `../../../../borel-systemui` (note the four levels up from `auth/`); `import type { User, AuthResult } from "./types";`; `{ SUCCESS, failed, authErrorMessage, displayNameFor, madeWithoutSession }` from `./errors`; `{ AUTH_REDIRECT_URL, APPLE_IN_PREVIEW, WRONG_CURRENT_PASSWORD }` from `./constants`. Move verbatim `signUp` (102-141), `signIn` (148-165), `signOut` (167-174), `sendPasswordReset` (176-186), `resetPassword` (188-195), `confirmEmail` (197-211), `updatePassword` (217-234), `resendConfirmation` (236-240), `deleteAccount` (242-257), `signInWithApple` (262-294), and the module-level `synced` set plus `syncProfile` (296-317). Export every function including `syncProfile`. Keep all comments. Do not modify `auth.tsx`.
  - Tests: none - imports the runtime `../db` client; unit-testing would require mocking the whole Borel client, and the logic is a verbatim move
  - Done when: `actions.ts` exists and exports the ten public calls plus `syncProfile`; `bun run typecheck` passes.

## Wave 5
Depends on Wave 4 (`./actions`).

- [x] T5: Extract session provider and hooks
  - Files: `src/lib/core/auth/context.tsx` (create)
  - Do: Create `context.tsx` from `auth.tsx`. Imports: `React, { createContext, useContext, useEffect, useMemo, useState }` from `react`; `{ db }` from `../db`; `import type { User, Session } from "./types";`; `{ syncProfile }` from `./actions`; and the action values `{ signUp, signIn, signOut, sendPasswordReset, updatePassword, resendConfirmation, deleteAccount, confirmEmail, resetPassword }` from `./actions`. Move verbatim `AuthState` (319-326), `AuthContextValue` (328-338), `AuthContext` (340), `AuthProvider` (342-380, with doc comment), `useAuth` (382-387, with doc comment), and `useKitSession` (527-561, with doc comment). Export `AuthState`, `AuthContextValue`, `AuthProvider`, `useAuth`, `useKitSession`; keep `AuthContext` module-private. `useKitSession` keeps its fallback subscription to `db.auth`. Do not modify `auth.tsx`.
  - Tests: none - provider/hook needs a React renderer and the runtime `db`; no render-testing library is installed
  - Done when: file exists, exports the provider, both hooks, and both types; `bun run typecheck` passes.

## Wave 6
Depends on Waves 3-5 (controls, actions, context).

- [x] T6: Extract SignInFlow and SignInSheet
  - Files: `src/lib/core/auth/SignInFlow.tsx` (create), `src/lib/core/auth/SignInSheet.tsx` (create)
  - Do: Create both from `auth.tsx`.
    - `SignInFlow.tsx` imports: `React, { useEffect, useRef, useState }` from `react`; `{ Platform, Pressable, Text, View }` from `react-native`; `import type { AuthResult } from "./types";`; `{ APPLE_SIGN_IN_AVAILABLE, IN_PREVIEW, PASSWORD_RESET_AVAILABLE, KIT }` from `./constants`; `{ labelsWith }` and `import type { AccountKitLabels }` from `./labels`; `{ Field, PrimaryButton, LinkButton, AppleButton, Note, Problem }` from `./controls`; `{ signIn, signUp, confirmEmail, resendConfirmation, sendPasswordReset, resetPassword, signInWithApple }` from `./actions`; `{ useKitSession }` from `./context`; `{ openPrivacyPolicy, openTermsOfUse }` from `../legal`; `{ db }` from `../db`. Move verbatim `SignInStep` (683) and `SignInFlow` (685-905, with doc comment). Export `SignInStep`, `SignInFlow`.
    - `SignInSheet.tsx` imports: `React` from `react`; `{ Modal, ScrollView, View }` from `react-native`; `{ labelsWith }` and `import type { AccountKitLabels }` from `./labels`; `{ LinkButton }` from `./controls`; `{ SignInFlow }` from `./SignInFlow`. Move verbatim `SignInSheet` (907-926, with doc comment). Export `SignInSheet`.
    - Do not modify `auth.tsx`.
  - Tests: none - screen components; no render-testing library installed
  - Done when: both files exist with the listed exports; `bun run typecheck` passes.

## Wave 7
Depends on Wave 6 (`./SignInSheet`).

- [x] T7: Extract RequireAccount and AccountPanel
  - Files: `src/lib/core/auth/RequireAccount.tsx` (create), `src/lib/core/auth/AccountPanel.tsx` (create)
  - Do: Create both from `auth.tsx`.
    - `RequireAccount.tsx` imports: `React, { useState }` from `react`; `{ Text, View }` from `react-native`; `{ labelsWith }` and `import type { AccountKitLabels }` from `./labels`; `{ PrimaryButton }` from `./controls`; `{ useKitSession }` from `./context`; `{ SignInSheet }` from `./SignInSheet`; `{ KIT }` from `./constants`. Move verbatim `RequireAccount` (928-953, with doc comment). Export `RequireAccount`.
    - `AccountPanel.tsx` imports: `React, { useState }` from `react`; `{ Linking, Text, View }` from `react-native`; `{ labelsWith }` and `import type { AccountKitLabels }` from `./labels`; `{ Field, PrimaryButton, LinkButton, Note, Problem }` from `./controls`; `{ useKitSession }` from `./context`; `{ updatePassword, deleteAccount, signOut }` from `./actions`; `{ WRONG_CURRENT_PASSWORD, MANAGE_SUBSCRIPTIONS_URL, KIT }` from `./constants`; `{ RequireAccount }` from `./RequireAccount`. Move verbatim `AccountPanel` (955-1076, with doc comment). Export `AccountPanel`.
    - Do not modify `auth.tsx`.
  - Tests: none - screen components; no render-testing library installed
  - Done when: both files exist with the listed exports; `bun run typecheck` passes.

## Wave 8
Depends on all previous waves.

- [x] T8: Rewrite auth.tsx as the connector
  - Files: `src/lib/core/auth.tsx` (modify)
  - Do: Replace the whole file with the Borel header comment (lines 1-6, kept verbatim) plus a one-line note `// Implementation lives in ./auth/ submodules; this file is the public connector.` then explicit re-exports, preserving the exact public surface:
    ```tsx
    export type { User, Session, AuthResult } from "./auth/types";
    export { AUTH_REDIRECT_URL, APPLE_IN_PREVIEW, APPLE_SIGN_IN_AVAILABLE, PASSWORD_RESET_AVAILABLE } from "./auth/constants";
    export { authErrorMessage } from "./auth/errors";
    export type { AuthState, AuthContextValue } from "./auth/context";
    export { AuthProvider, useAuth } from "./auth/context";
    export type { AccountKitLabels } from "./auth/labels";
    export type { SignInStep } from "./auth/SignInFlow";
    export {
      signUp, signIn, signOut, sendPasswordReset, resetPassword,
      confirmEmail, updatePassword, resendConfirmation, deleteAccount, signInWithApple,
    } from "./auth/actions";
    export { SignInFlow } from "./auth/SignInFlow";
    export { SignInSheet } from "./auth/SignInSheet";
    export { RequireAccount } from "./auth/RequireAccount";
    export { AccountPanel } from "./auth/AccountPanel";
    ```
    Do not re-export internal helpers (`SUCCESS`, `failed`, `displayNameFor`, `madeWithoutSession`, `WRONG_CURRENT_PASSWORD`, `KIT`, `LABELS`, `labelsWith`, `IN_PREVIEW`, `useKitSession`, `Field`, `PrimaryButton`, `LinkButton`, `APPLE_LOGO_PATH`, `AppleButton`, `Problem`, `Note`, `syncProfile`). Do not create `auth/index.tsx`.
  - Tests: none - verified by the full verification task
  - Done when: `auth.tsx` contains only the header, the note, and the re-exports above; all existing consumers (`import { useAuth } from "../core/auth"`, `{ RequireAccount }`, `{ AccountPanel }`, `{ AuthProvider }`) resolve unchanged; `bun run typecheck` passes.

## Wave 9
Final verification. Depends on Wave 8.

- [x] T9: Verify the split (build skipped: no build script)
  - Files: none (read-only verification)
  - Do: Run in order:
    1. `bun run typecheck`
    2. `bun run lint`
    3. `bun run test`
    Record the build step as skipped: `package.json` has no build script (only `start`, `typecheck`, `lint`, `test`), and this is an Expo project with no separate bundle step.
  - Tests: none - this IS the verification step
  - Done when: typecheck, lint, and test all pass. If any fails, report the exact output and mark this task blocked.
