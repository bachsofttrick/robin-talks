# Design

## Context

See proposal.md for motivation. The current `chatOnce` (src/lib/core/db/ai.ts:247) is the single transport for `ai.chat` (with a JSON retry loop) and `ai.transcribe`; it POSTs to `BOREL_AI/chat/completions` through `borelFetch`, which attaches the app's Borel bearer and surface headers and lets the cloud enforce wallet refusals. `ai.image` and `ai.editImage` call separate Borel endpoints and stay as they are. Callers (`useRobin.tsx`, `Session/index.tsx`) consume `AiChatResult` / `AiTranscribeResult` and must keep doing so unchanged.

OpenRouter facts confirmed from its live catalog and API docs (Oct 2026):
- `openai/gpt-6-luna`: chat + image input, no audio input. Base URL `https://openrouter.ai/api/v1`, OpenAI-compatible chat completions.
- `qwen/qwen3-asr-0.6b`: served only through `POST /api/v1/audio/transcriptions` with `{ model, input_audio: { data, format } }`, answering `{ text, usage }`. No system prompt, no language hint, no prompt field.
- Error codes: 400 malformed input, 401 invalid key, 402 insufficient credits, 403 spend limit reached, 404 unknown model, 429 rate limited, 502 upstream failure.

## Goals / Non-Goals

**Goals:**
- Chat and transcription leave the phone directly for OpenRouter.ai, with the same result contracts (`AiChatResult`, `AiTranscribeResult`) and the same neutral-sentence style.
- Consent disclosures name OpenRouter.ai and the model makers, with fresh keys so previous "Allow" records do not silently cover a new company.
- Keep the pure, testable helpers (photo/audio encoding, JSON reading, no-speech detection) and their tests working with as little movement as possible.

**Non-Goals:**
- Streaming (nothing today consumes a stream).
- Any Borel-side change; `image`, `editImage`, storage, auth, moderation, notify are untouched.
- Hiding the OpenRouter key behind a proxy or user-entered key UI (option A was chosen in exploration; the trade-off is accepted).

## Decisions

**1. SDK for chat, plain fetch for transcription.**
`ai.chat` uses `@openrouter/sdk`: one module-level client `new OpenRouter({ apiKey })` and the standalone `chatSend(client, { chatRequest })` form (`OpenRouterCore`) for tree-shaking. `ai.transcribe` uses plain `fetch` to `/api/v1/audio/transcriptions`, because the STT endpoint is a different wire shape from chat and the SDK's chat resource does not express it. Alternative considered: plain `fetch` for both (zero dependency risk). Rejected because the user explicitly chose the SDK, and the chat request shape is exactly the SDK's strong point; the transcription fetch is ~30 lines against a documented endpoint.

**2. API key from `EXPO_PUBLIC_OPENROUTER_API_KEY`.**
Added to `src/lib/core/db/config.ts` beside the other `EXPO_PUBLIC_*` reads. A missing key resolves `chat`/`transcribe` with the neutral "couldn't answer right now" sentence and a detail field naming the missing config, before any consent dialog (asking permission for a request that cannot be made would be noise). The key that ships must be a dedicated OpenRouter key with a hard monthly credit limit, created specifically for this app.

**3. Own timeout, no SDK retries.**
The current 75 s existed because Borel ran a fallback model server-side; direct-to-one-model needs less. Chat timeout: 60 s via `AbortController` passed through the SDK's `options.fetchOptions.signal`. SDK retry config disabled (0 retries): the JSON retry loop is the app's own retry policy, and stacking two retry layers doubles the worst-case wait.

**4. One error mapper for OpenRouter codes.**
`refusalOf`/`NEUTRAL_ERROR` keep serving `image`/`editImage` unchanged. The chat/transcribe path gets a small `OPENROUTER_SAYS` mapping: 402 and 404 → the "isn't available right now" sentence, 403 and 429 → the existing "AI has reached today's limit" sentence, everything else non-2xx with a plain message → that message, else the "couldn't answer right now" sentence; network failure → "check your connection", timeout → "took too long". The API message is shown only when it passes the existing `looksPlain` gate; technical text always goes to `detail`. `noteRefusal` (the Borel owner notice) and the `ai:metered` parent ping drop out of the chat path entirely.

**5. Transcription keeps its local guards, loses its prompt scaffolding.**
`sendableAudio`, the 3 MB / 4 MB base64 caps, and `audioFormatOf` stay. `TRANSCRIBE_RULES`, `transcribeInstruction`, `max_tokens: 2048`, and the `[no speech]` sentinel go: an ASR model is verbatim by nature, so the honesty goal the rules served is met by the model itself. `heardNoSpeech` shrinks to "text is empty after trim" (silence plus a 400-with-no-words probe decides the final shape at implementation time). The `language` and `prompt` parameters of `ai.transcribe` are accepted and ignored so callers stay untouched.

**6. Consent rewording with fresh keys.**
`AI_MAKERS` gains `"openai/gpt-6-luna": "GPT-6 by OpenAI"` and `"qwen/qwen3-asr-0.6b": "Qwen3 ASR by Alibaba"`. `AI_AUDIO_MODEL` becomes `qwen/qwen3-asr-0.6b`. Keys move from `neon:<maker>` / `openai:chat` to `openrouter:chat`, `openrouter:photo`, `openrouter:audio`; the `openai:image` / `openai:edit` keys are untouched (Borel images still go to OpenAI). Messages: text chat → "sends what you type to OpenRouter.ai, which runs GPT-6 by OpenAI"; photo chat → adds "and the photos you add"; audio → "sends your recording to OpenRouter.ai, which runs Qwen3 ASR by Alibaba". The fallback maker reference to `qwen3-next-80b-a3b-instruct` is retired with the wording.

## Risks / Trade-offs

- [Shipped key is extractable from the app bundle] → Dedicated key with a hard monthly credit limit; rotation is a dashboard operation, not a rebuild.
- [OpenRouter STT may not accept `m4a`, which is what expo-audio records] → Spike first: one scripted request with a real device recording. If rejected, re-encode to `wav` before sending (expo-audio re-record in `wav`, or accept the size hit on the 3 MB cap).
- [`@openrouter/sdk` is ESM-only and Node-first] → Metro resolves `package.exports` on Expo 57; jest needs `transformIgnorePatterns` coverage. First typecheck and first test run confirm; if the SDK pulls a Node-only dependency, fall back to plain `fetch` for chat too (the fallback is small because the request shape is already known).
- [Consent keys change, so every user is re-prompted once] → Deliberate and correct for a new data recipient (Apple 5.1.2(i)); the wording change is the point.
- [No owner notice on chat refusals any more] → Accepted: refusals were Borel's wallet economy; OpenRouter's credit/limit signals surface as user-facing sentences instead.

## Migration Plan

1. Add the env var and the dependency; create the capped OpenRouter key.
2. Land the code change (ai.ts, consent.ts, config.ts) in one commit; behavior switches over as soon as the app rebuilds.
3. Spike check on `m4a` before merging (task 1).
4. Rollback is `git revert` of that commit; Borel's chat endpoint still exists and resumes serving as before.

## Open Questions

Resolved by the STT spike (task 1.1), probed against the live endpoint with the capped key. None of these change the specs' observable contracts.

- `input_audio` shape: the request body is `{ model, input_audio: { data, format } }` and both fields are required. A body without `format` or without `input_audio` returns 400.
- `input_audio.data` is raw base64, never a `data:` URL. A data URL is rejected with 400 "Provider could not process the audio input (unsupported or malformed audio)". `sendableAudio` returns data URLs on all branches, so `transcribe` strips the `data:<type>;base64,` prefix before sending.
- `format` is a short alphanumeric audio name matching `/^[a-zA-Z0-9][a-zA-Z0-9+._-]{0,15}$/`: `wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm`, `aac`. The MIME form `audio/m4a` is rejected. `audioFormatOf` already produces the short names, and `m4a` is accepted, so expo-audio's m4a recordings go straight through.
- Silence: a digitally silent wav returned a non-empty filler (`"嗯。"`) rather than empty `text`; a non-speech tone returned `{"text":""}`. The "text is empty after trim" check catches the tone case and any API that answers with no words, which is what the "no words were heard" scenario requires; a hallucinated filler on digital silence is the model's own output, not an error the app can detect.
- Model availability: `qwen/qwen3-asr-0.6b` is absent from the `/models` list but resolves through `/models/qwen/qwen3-asr-0.6b/endpoints` with an `stt` workload, and `openai/gpt-6-luna` appears in the list with text+image input. Both are live.
