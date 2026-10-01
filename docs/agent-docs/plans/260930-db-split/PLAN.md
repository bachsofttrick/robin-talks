# Plan: Split db.ts into focused modules

Status: approved
Request: Split db.ts files to many files, with db.ts as index and export.

## Approach

The current `src/lib/core/db.ts` is 1,983 lines and mixes 7 distinct concerns: env/surface config, error/normalization, authentication (brokered preview + native session cookies), storage, AI (chat/transcribe/image/editImage with media encoding), moderation, and push notifications/device linking. Split it into single-concern modules in a new `src/lib/core/db/` folder, with `db.ts` becoming a thin re-export index. Each new file groups one concern, staying under ~400 lines for readability. No logic changes: the same functions, types, and exported names are preserved byte-for-byte, only `import` paths move. The `db` barrel export (`Object.assign(client, {...})`) stays at the bottom of `db.ts`.

## Affected Code

- `src/lib/core/db.ts` — reduced to re-exports + the final `db` assembly (the only Borel-managed surface that changes; Borel sees one file, same exports)
- `src/lib/core/db/config.ts` — env URLs, SURFACE/BUILD_STAMP detection, `borelHeaders`, `createInviteLink`, shared consts
- `src/lib/core/db/errors.ts` — `AiRefusal`, neutral error tables, `plainError`, `looksPlain`, `messageOf`, refusal constants/tables, `refusalOf`, `noteRefusal`
- `src/lib/core/db/consent.ts` — AI consent state, `aiConsentWording`, `askAiConsent`, `AI_DECLINED`
- `src/lib/core/db/auth.ts` — `User`, `Session`, brokered preview session (brokerAuth, postToParent, loadBrokerToken, setBrokerToken, brokerFetch), native session cookies + sessionPlugin, `authHeader`, `authCall`, `appleCall`, `adoptSession`, `announceSessionChanges`
- `src/lib/core/db/storage.ts` — `storage` object, `storageCall`, `Uploadable`, helpers (`toBlob`, `contentTypeOf`, `putBytes`, `encodePath`), `account` object
- `src/lib/core/db/ai.ts` — `ai` object, `borelFetch`, chat helpers (`chatOnce`, `readJson`, `asksForJson`, `balancedEnd`), transcribe helpers (`heardNoSpeech`, `transcribeInstruction`, `TRANSCRIBE_RULES`), image/editImage in-flight map, media encoding (`encodeBase64`, `blobToDataUrl`, `sendableImage`, `sendableAudio`, `audioFormatOf`), shared `ChatContentPart`/`ChatMessage` types and AI result types
- `src/lib/core/db/moderation.ts` — `moderation` object, `ReportReason`, `ModerationTarget`, moderation state (hiddenContent/blockedAuthors), `moderationCall`, `loadModeration`, `forgetModeration`, `moderationChanged`, `REASON_LABELS`, content check
- `src/lib/core/db/notify.ts` — `notify`, `NotifyResult`, push token/device linking (`deviceToken`, `deviceCall`, `releaseDevice`, `syncDevice`, `watchSessions`, `watchDevice`, `followDevice`, `atMost`), `tellScreens`, phoneSubscribers

## Data Model and Contracts

No new data models. All existing exports are preserved:
- `db` (the assembled client + auth/storage/ai/account/moderation/notify)
- Named exports: `DATA_API_URL`, `AUTH_URL`, `PREVIEW_AUTH_URL`, `BOREL_STORAGE`, `BOREL_AI`, `BOREL_ACCOUNT`, `BOREL_APPLE`, `BOREL_USAGE_URL`, `BOREL_INVITE_URL`, `createInviteLink`, `plainError`, `authCall`, `adoptSession`, `appleCall`, `looksPlain` (used internally)
- Types: `AiRefusal`, `User`, `Uploadable`, `ChatContentPart`, `ChatMessage`, `AiImageAsset`, `AiImageInput`, `AiAudioRecording`, `AiAudioInput`, `AiChatResult`, `AiTranscribeResult`, `AiImageResult`, `ReportReason`, `ModerationTarget`, `NotifyResult`

Internal-only functions (not currently exported but referenced across sections) are moved to their owning module with appropriate `import` statements added: `refusalOf`, `noteRefusal`, `messageOf`, `looksPlain`, `borelHeaders`, `authHeader`, `askAiConsent`, `AI_AUDIO_MODEL`, `AI_DECLINED`, `postToParent`.

## Libraries

- `@neondatabase/neon-js` ^0.7.0: createClient, SupabaseAuthAdapter — stays in auth.ts
- `expo-constants`: Constants — stays in config.ts
- `react`: useEffect, useState — stays in moderation.ts (useChanges hook)
- `react-native`: Alert, Linking — spread across consent.ts, errors.ts, moderation.ts
- `@react-native-async-storage/async-storage`: AsyncStorage — auth.ts, notify.ts

## Risks

- Circular imports between new modules: mitigated by a strict dependency order — config -> errors -> consent -> auth -> {storage, ai, moderation, notify}, with no backwards edges. `db.ts` imports from all of them.
- Cross-module shared helpers (e.g., `authHeader` used by both `notify` and `storage`): each module imports directly from the module that defines it (auth.ts), not from the barrel.
- Borel regeneration overwriting db.ts: db.ts remains the single Borel-managed file. The new `db/` folder is not marked as Borel-managed, so it is left alone.
