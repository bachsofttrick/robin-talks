# Proposal

## Why

Robin's chat and transcription currently depend on the Borel cloud proxy (`BOREL_AI/chat/completions`), which meters usage, bills a wallet, and refuses requests (`wallet_empty`, `daily_allowance_used`, `cloud_paused`) the user cannot resolve themselves. Moving chat and transcription to OpenRouter direct puts the model behind a key this app controls, removes the metering middleman, and lets the session voice loop work against an ASR model built for the job.

## What Changes

- Replace `chatOnce`'s transport (src/lib/core/db/ai.ts): `ai.chat` calls the `@openrouter/sdk` client (`chat.send`) against OpenRouter directly, model `openai/gpt-6-luna`, API key from `EXPO_PUBLIC_OPENROUTER_API_KEY`.
- `ai.transcribe` no longer shares `chatOnce`: it gets its own transport to OpenRouter's Speech-to-Text endpoint (`POST /api/v1/audio/transcriptions`), model `qwen/qwen3-asr-0.6b`. No system prompt, language hint, or names prompt (the endpoint takes only model + audio). Empty text or a 400 means no speech.
- **BREAKING** (runtime behavior): Borel-side refusals no longer apply to chat. Error mapping switches to OpenRouter's codes: 401 invalid key, 402 insufficient credits, 403 spend limit reached, 429 rate limited, 502 upstream failure, each producing one neutral plain sentence per the existing style.
- The `ai:metered` parent ping and `refusalOf`/`noteRefusal` wiring drop out of the chat path (they stay for `image`/`editImage`, which remain on Borel).
- Consent rewording (src/lib/core/db/consent.ts): chat, photoChat, and audio disclosures now say OpenRouter.ai instead of Neon; `AI_MAKERS` covers `openai/gpt-6-luna` (GPT-6 by OpenAI) and `qwen/qwen3-asr-0.6b` (Qwen3 ASR by Alibaba). **BREAKING** for consent state: fresh consent keys (`openrouter:*`), so users who previously allowed get asked once more, which is the required Apple 5.1.2(i) behavior since data now flows to a different company.
- `AI_AUDIO_MODEL` changes from `gemini-3-flash` to `qwen/qwen3-asr-0.6b`.
- `image` and `editImage` stay on Borel, unchanged.
- New dependency: `@openrouter/sdk` (ESM-only; jest-expo and Metro resolution must be confirmed on the first test run).

## Capabilities

### New Capabilities
- `ai-provider`: the app's direct-to-OpenRouter AI surface. Covers chat completion behavior (model choice, JSON retry, truncation, timeout), speech-to-text behavior (STT endpoint, model, no-speech handling, format limits), error-to-neutral-sentence mapping, and consent disclosure for OpenRouter as the third-party AI company. Image generation and editing remain Borel-backed and stay in this capability's boundary as "unchanged behavior" only if a requirement references them; otherwise they are out.

### Modified Capabilities
- (none - the project has no existing specs)

## Impact

- Code: `src/lib/core/db/ai.ts` (chatOnce transport, transcribe transport, error mapping), `src/lib/core/db/consent.ts` (wording, AI_MAKERS, AI_AUDIO_MODEL, consent keys), `src/lib/core/db/config.ts` (new `EXPO_PUBLIC_OPENROUTER_API_KEY` env var read).
- Callers (`src/lib/api/useRobin.tsx`, `src/screens/Session/index.tsx`) keep the same `db.ai.chat` / `db.ai.transcribe` contracts; no caller changes expected.
- Dependencies: add `@openrouter/sdk`; jest `transformIgnorePatterns` may need it.
- Systems: OpenRouter.ai becomes a data recipient for typed text, photos, and recordings; Borel remains for images, storage, auth, moderation.
- Risks: shipped key is extractable (accept; use a dedicated key with a hard monthly credit cap); whether OpenRouter's STT endpoint accepts `m4a` from expo-audio recordings is unconfirmed (spike before or during implementation); SDK behavior on React Native/Hermes (first typecheck and test run will confirm).
