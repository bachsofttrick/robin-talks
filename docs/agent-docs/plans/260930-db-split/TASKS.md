# Tasks: Split db.ts into focused modules

Status: in_progress
Plan: PLAN.md

## Wave 1
No cross-module dependencies. config.ts and errors.ts are foundational.

- [ ] T1: Extract config.ts (commit 6c2aed6)
  - Files: `src/lib/core/db/config.ts` (create)
  - Do: Create `src/lib/core/db/config.ts` from the corresponding section of `src/lib/core/db.ts`. Move verbatim:
    - `import Constants from "expo-constants";`
    - All `export const *_URL` env var declarations (DATA_API_URL, AUTH_URL, PREVIEW_AUTH_URL, BOREL_STORAGE, BOREL_AI, BOREL_ACCOUNT, BOREL_APPLE, BOREL_USAGE_URL, BOREL_INVITE_URL)
    - `createInviteLink` function
    - `IN_BROWSER` constant
    - `RUNTIME`, `IS_DEV_SURFACE`, `SURFACE`, `BUILD_STAMP` declarations
    - `borelHeaders` function
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction, verified by final typecheck
  - Done when: file exists with all env URLs, surface detection, and borelHeaders. Exports match the originals byte-for-byte.

- [ ] T2: Extract errors.ts (commit 6c2aed6)
  - Files: `src/lib/core/db/errors.ts` (create)
  - Do: Create `src/lib/core/db/errors.ts` from the error/normalization section of `db.ts`. Move verbatim:
    - Its own imports: `import { Linking } from "react-native";`, `import { IN_BROWSER, SURFACE, BOREL_USAGE_URL } from "./config";`
    - `AiRefusal` type export
    - `NEUTRAL_ERROR`, `CLOUD_NEUTRAL` records
    - `CODE_CHARACTERS`, `TECHNICAL_WORDS` sets
    - `looksPlain`, `messageOf`, `DATA_SAYS`, `plainError` functions
    - `NOTICE_TITLE`, `NOTICE_BODY`, `CLOUD_NOTICE_TITLE`, `CLOUD_NOTICE_BODY` records, `noticed` set
    - `refusalOf` function
    - `postToParent` function
    - `noteRefusal` function
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `plainError`, `AiRefusal`, `refusalOf`, `noteRefusal`, `postToParent`, `looksPlain`, `messageOf`.

## Wave 2
Depends on Wave 1 (config.ts, errors.ts).

- [ ] T3: Extract consent.ts (commit b7604aa)
  - Files: `src/lib/core/db/consent.ts` (create)
  - Do: Create `src/lib/core/db/consent.ts` from the AI consent section of `db.ts`. Move verbatim:
    - Imports: `import AsyncStorage from "@react-native-async-storage/async-storage";`, `import { Alert } from "react-native";`, `import { SURFACE } from "./config";`
    - `AI_CONSENT_KEY`, `AI_MAKERS`, `AI_AUDIO_MODEL`, `AI_DECLINED` constants
    - `aiConsentGiven`, `aiConsentAsking` module state
    - `AiConsentKind` type
    - `aiConsentWording` function
    - `askAiConsent` function
    - IMPORTANT: Line 191 in `db.ts` references `ai.models.fast`. To avoid a circular import (consent -> ai -> consent), replace this with the string literal `"qwen3-next-80b-a3b-instruct"` directly in consent.ts. This is the only logic change in the entire refactor.
    - Preserve all other comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `askAiConsent`, `AI_DECLINED`, `AI_AUDIO_MODEL`. No circular dependency with ai.ts.

- [ ] T4: Extract auth.ts (commit b7604aa)
  - Files: `src/lib/core/db/auth.ts` (create)
  - Do: Create `src/lib/core/db/auth.ts` from the auth/client section of `db.ts`. Move verbatim:
    - Imports: `import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";`, `import Constants from "expo-constants";`, `import AsyncStorage from "@react-native-async-storage/async-storage";`, plus from local: `import { AUTH_URL, PREVIEW_AUTH_URL, DATA_API_URL, BOREL_ACCOUNT, BOREL_APPLE, IN_BROWSER, SURFACE } from "./config";`, `import { postToParent } from "./errors";`
    - `Session` type, `User` interface
    - Brokered preview state: `BROKERED_SESSION_STORAGE_KEY`, `brokerToken`, `brokerLoaded`, `currentSession`, `Listener`, `listeners`
    - `loadBrokerToken` function
    - `setBrokerToken` function (calls `forgetModeration` from moderation.ts — add `import { forgetModeration } from "./moderation";` to auth.ts; ES module circular imports resolve at call-time, which is safe here)
    - `brokerFetch` function
    - `brokerAuth` object — ADD `export` keyword: `export const brokerAuth = { ... }`
    - `authCall` function
    - Native session state: `SESSION_STORAGE_KEY`, `StoredCookie` type, `sessionCookies`, `sessionLoad`
    - `loadSessionCookies`, `saveSessionCookies`, `splitSetCookie`, `rememberCookies`, `sessionCookieHeader` functions
    - `sessionPlugin` object
    - `dataFetch` function
    - `nativeClient`, `native()` function
    - `client` declaration
    - `authHeader` function
    - `adoptSession` function
    - `appleCall` function
    - `announceSessionChanges` function (uses `tellScreens` from notify.ts — add `import { tellScreens } from "./notify";`; circular import resolves at call-time)
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `authHeader`, `native`, `client`, `authCall`, `appleCall`, `adoptSession`, `brokerAuth`.

## Wave 3
Depends on Wave 2 (auth.ts is needed for authHeader). storage, moderation, notify are independent of each other.

- [ ] T5: Extract storage.ts (commit 37e2b6a)
  - Files: `src/lib/core/db/storage.ts` (create)
  - Do: Create `src/lib/core/db/storage.ts` from the storage section of `db.ts`. Move verbatim:
    - Imports: `import { BOREL_STORAGE, BOREL_ACCOUNT, IN_BROWSER } from "./config";`, `import { authHeader } from "./auth";`, `import { looksPlain, messageOf } from "./errors";`, `import { refusalOf, noteRefusal } from "./errors";`
    - `StorageResult<T>` type
    - `FILES_SAY` record, `MAX_FILE_BYTES`, `MAX_VIDEO_BYTES` constants
    - `storageCall` function
    - `Uploadable` type
    - `toBlob`, `contentTypeOf`, `putBytes`, `encodePath` helper functions
    - `storage` object
    - `account` object
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `storage` and `account` objects.

- [ ] T6: Extract moderation.ts (commit 37e2b6a)
  - Files: `src/lib/core/db/moderation.ts` (create)
  - Do: Create `src/lib/core/db/moderation.ts` from the moderation section of `db.ts`. Move verbatim:
    - Imports: `import { useEffect, useState } from "react";`, `import { Alert } from "react-native";`, `import { BOREL_ACCOUNT } from "./config";`, `import { authHeader } from "./auth";`
    - `ReportReason` type, `ModerationTarget` interface
    - `BOREL_MODERATION` constant computation
    - `hiddenContent`, `blockedAuthors`, `moderationListeners`, `moderationLoaded`, `moderationEpoch` state
    - `moderationChanged`, `forgetModeration` functions — ADD `export` to `forgetModeration`
    - `moderationCall`, `loadModeration` functions
    - `REASON_LABELS` constant
    - `moderation` object
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `moderation` object and `forgetModeration` function.

- [ ] T7: Extract notify.ts (commit 37e2b6a)
  - Files: `src/lib/core/db/notify.ts` (create)
  - Do: Create `src/lib/core/db/notify.ts` from the notifications/device-linking section of `db.ts`. Move verbatim:
    - Imports: `import AsyncStorage from "@react-native-async-storage/async-storage";`, `import Constants from "expo-constants";`, `import { BOREL_ACCOUNT, IN_BROWSER, DATA_API_URL } from "./config";`, `import { native, authHeader } from "./auth";`, `import { refusalOf, noteRefusal, looksPlain, messageOf, postToParent } from "./errors";`
    - `BOREL_PROXY` constant computation
    - `PUSH_TOKEN_KEY`, `PUSH_LINKED_KEY`, `NOTIFY_TIMEOUT_MS`, `DEVICE_CALL_TIMEOUT_MS`, `SIGN_OUT_WAIT_MS` constants
    - `NOTIFY_SAYS` record
    - `NotifyResult` type
    - `notify` function
    - `announcedToken`, `linkedThisLaunch`, `deviceWork` state
    - `followDevice`, `atMost`, `deviceToken`, `deviceCall`, `releaseDevice`, `syncDevice` functions
    - `watchSessions`, `watchDevice` functions
    - `watchDevice()` module-level call (preserved at bottom of file — this is a required side effect)
    - `AuthCallback` type, `phoneSubscribers` state
    - `tellScreens` function — ADD `export` to `tellScreens`
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `notify`, `tellScreens`, and the `watchDevice()` side effect fires on import.

## Wave 4
Depends on all previous waves. ai.ts is the largest module.

- [ ] T8: Extract ai.ts (commit 249b244)
  - Files: `src/lib/core/db/ai.ts` (create)
  - Do: Create `src/lib/core/db/ai.ts` from the AI section of `db.ts`. Move verbatim:
    - Imports: `import { BOREL_AI, IN_BROWSER } from "./config";`, `import { postToParent } from "./errors";`, `import { askAiConsent, AI_DECLINED, AI_AUDIO_MODEL } from "./consent";`, `import { authHeader } from "./auth";`
    - `ChatContentPart`, `ChatMessage` types
    - `AiImageAsset`, `AiImageInput` types
    - `NO_PHOTO` constant
    - `BASE64_ALPHABET`, `encodeBase64`, `blobToDataUrl` functions
    - `sendableImage` function
    - `AiAudioRecording`, `AiAudioInput` types
    - `NO_RECORDING`, `RECORDING_TOO_LONG`, `RECORDING_UNREADABLE`, `MAX_AUDIO_BYTES`, `MAX_AUDIO_BASE64` constants
    - `audioFormatOf` function
    - `sendableAudio` function
    - `borelFetch` function
    - `AI_TIMEOUT_MS` constant
    - `AI_SAYS` record
    - `AiChatResult` type
    - `JSON_ONLY` constant, `asksForJson` function
    - `balancedEnd`, `readJson` functions
    - `chatFailure` function
    - `chatOnce` function
    - `AiTranscribeResult` type
    - `TRANSCRIBE_RULES` constant, `transcribeInstruction` function
    - `transcribeFailure` function
    - `heardNoSpeech` function
    - `AiImageResult` type
    - `inFlightImages` map
    - `ai` object (with `models`, `chat`, `transcribe`, `image`, `editImage`)
    - Preserve all comments verbatim. Do not modify `db.ts` in this task.
  - Tests: none — pure extraction
  - Done when: file exports `ai` object with all methods (`chat`, `transcribe`, `image`, `editImage`) and `models`.

## Wave 5
Integration. Depends on all module files existing.

- [ ] T9: Rewrite db.ts as barrel index (commit dbc9f74)
  - Files: `src/lib/core/db.ts` (modify)
  - Do: Replace the contents of `src/lib/core/db.ts` with a barrel file:
    - Keep the Managed-by-Borel header comment (lines 1-9)
    - Add a note: `// Implementation lives in ./db/ submodules. This file is the public barrel.`
    - Remove ALL implementation code (everything after the header that isn't an import or re-export)
    - Add imports from submodules:
      ```typescript
      import { client, native } from "./db/auth";
      import { storage, account } from "./db/storage";
      import { ai } from "./db/ai";
      import { moderation } from "./db/moderation";
      import { notify } from "./db/notify";
      import { IN_BROWSER, brokerAuth } from "./db/auth";
      ```
    - Re-export all public API:
      ```typescript
      export * from "./db/config";
      export * from "./db/errors";
      export { askAiConsent, AI_DECLINED, AI_AUDIO_MODEL } from "./db/consent";
      export { authHeader } from "./db/auth";
      export { authCall, appleCall, adoptSession, client, native } from "./db/auth";
      export * from "./db/storage";
      export * from "./db/ai";
      export * from "./db/moderation";
      export { notify } from "./db/notify";
      ```
    - Preserve the `db` assembly at the bottom:
      ```typescript
      export const db = Object.assign(client, {
        auth: IN_BROWSER ? brokerAuth : native().auth,
        storage, ai, account, moderation, notify
      });
      ```
    - IMPORTANT: Ensure module-level side effects fire. `watchDevice()` in notify.ts and `announceSessionChanges()` in auth.ts run when their modules are imported. The barrel must import both `./db/auth` and `./db/notify` for these to trigger.
    - Run `bun run typecheck` to verify the barrel compiles. Fix any import errors.
  - Tests: none — verified by final full verification
  - Done when: `db.ts` contains only the header comment, imports, re-exports, and the `db` assembly. `bun run typecheck` passes. All existing consumers (`import { db, plainError, ... }`) resolve unchanged.

## Wave 6
Final verification. Depends on Wave 5.

- [ ] T10: Verify the full refactor (commit 2365fab)
  - Files: none (read-only verification)
  - Do: Run the full project verification suite in order:
    1. `bun run typecheck` — must pass with no errors
    2. `bun run lint` — must pass with no errors
    3. `bun run test` — must pass with no failures
  - Tests: none — this IS the verification step
  - Done when: all three commands pass. If any fail, report the exact error output and mark this task as blocked.
