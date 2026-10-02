# Tasks

## 1. Spikes and setup

- [x] 1.1 Probe the OpenRouter STT endpoint with a real expo-audio recording (m4a) against `qwen/qwen3-asr-0.6b`: record whether `m4a` is accepted, whether `text` comes back empty or a 400 comes back on silence, and record accepted `format` values; write the findings into design.md's Open Questions section
- [x] 1.2 Create a dedicated OpenRouter key with a hard monthly credit limit for this app and record `EXPO_PUBLIC_OPENROUTER_API_KEY` in the local env; verify `bun run typecheck` stays clean after adding it to config.ts reads
- [x] 1.3 Add `@openrouter/sdk` to package.json (`bun install`), then run `bun run typecheck` and `bun run test`; if either fails on the ESM-only package, add jest `transformIgnorePatterns` coverage (or, if a Node-only dependency breaks Metro, record that and switch design decision 1 to plain fetch for chat)

## 2. Chat transport (ai.ts)

- [x] 2.1 Add `EXPO_PUBLIC_OPENROUTER_API_KEY` to src/lib/core/db/config.ts and return early with the neutral "couldn't answer right now" error (detail: missing key) from `chat` when it is absent; verify with a unit test that the missing-key path resolves without a network call
- [x] 2.2 Build the module-level OpenRouter client (`OpenRouterCore` + standalone `chatSend`, retries disabled, `AbortController` signal with the 60 s timeout passed through fetchOptions) and replace `chatOnce`'s body with it; keep `AiChatResult`'s shape (`text`, `status`, `truncated`, `raw`, `detail`) and the `finish_reason === "length"` truncated flag; verify with a unit test that a mocked SDK success populates `text` and a mocked length-cutoff sets `truncated`
- [x] 2.3 Implement the OpenRouter error mapping (402/404 → "isn't available right now", 403/429 → "reached today's limit", other non-2xx → plain-message-or-"couldn't answer right now", offline → "check your connection", timeout → "took too long"; API message only when `looksPlain` passes; technical text into `detail`); verify with unit tests per code covering 402, 403, 429, 502, an offline failure, and a non-plain API message
- [x] 2.4 Keep the JSON retry loop, `asksForJson`, and `readJson` unchanged and confirm `chat(json: true)` flows through the new transport; verify the existing `readJson` tests still pass and add one test that an SDK-backed unreadable pair of replies resolves as the "unreadable" error
- [x] 2.5 Remove `noteRefusal`, `postToParent("ai:metered")`, `refusalOf`, `messageOf` usage from the chat path (leaving them for image/editImage) and keep photo preprocessing (`sendableImage` on image parts); verify with a unit test that an image-part message still gets encoded before the request and `bun run typecheck` reports no unused-symbol errors

## 3. Transcription transport (ai.ts)

- [x] 3.1 Write `transcribe`'s own transport: plain `fetch` to `https://openrouter.ai/api/v1/audio/transcriptions` with `{ model, input_audio: { data, format } }`, the same bearer key and timeout pattern; accept and ignore `language`/`prompt` so callers stay untouched; verify with a unit test that the request body contains exactly model + input_audio and a mocked `{ text }` response resolves as `text`
- [x] 3.2 Map transcription failures: empty or missing `text` → "no words were heard" sentence, size-cap breach before any request → "too long to send", unreadable audio → "record it again", other OpenRouter codes through the same mapper; verify with unit tests for empty text, the size cap, and a 502
- [x] 3.3 Replace `AI_AUDIO_MODEL` (`gemini-3-flash` → `qwen/qwen3-asr-0.6b`) in consent.ts and delete the now-unused `TRANSCRIBE_RULES`, `transcribeInstruction`, and `heardNoSpeech` from ai.ts; verify `bun run typecheck` and `bun run lint` pass with no dead references

## 4. Consent rewording (consent.ts)

- [x] 4.1 Extend `AI_MAKERS` with `"openai/gpt-6-luna": "GPT-6 by OpenAI"` and `"qwen/qwen3-asr-0.6b": "Qwen3 ASR by Alibaba"`, and retire the `qwen3-next-80b-a3b-instruct` fallback; verify with a unit test that `aiConsentWording` output for each kind carries the expected maker strings
- [x] 4.2 Rewrite chat, photoChat, and audio wording to name OpenRouter.ai with fresh keys (`openrouter:chat`, `openrouter:photo`, `openrouter:audio`), leaving `openai:image` / `openai:edit` untouched; verify with unit tests that each kind yields the new message text and key, and that a stored old-style key does not satisfy the new one
- [ ] 4.3 Verify the alert flow end to end on a device or simulator: first chat asks once, Allow is remembered for text, audio asks again separately, Don't Allow resolves to the permission sentence with no request sent; verify against the spec scenarios in specs/ai-provider/spec.md

## 5. Integration

- [x] 5.1 Run the full gate: `bun run typecheck`, `bun run lint`, `bun run test`; fix any fallout from the new dependency or removed symbols; verify all three pass
- [ ] 5.2 Manual smoke on a device with the capped key: Robin conversation round-trip (chat), one spoken turn (transcribe), one photo question (photoChat), one image generation (Borel, unchanged); verify each behaves per its spec scenario and the OpenRouter dashboard shows usage on the capped key
