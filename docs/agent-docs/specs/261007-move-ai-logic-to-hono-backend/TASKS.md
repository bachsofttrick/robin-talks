# Tasks: Move the mobile app's AI logic into the Hono backend

Status: complete

## Wave 1
- [x] T1: Backend AI router module with injected seams (commit c8ad353)
  - Satisfies: AC-1, AC-2, AC-3, AC-4, AC-5 (router services; not yet mounted)
  - Files: `apps/backend/src/routes/ai.ts` (new), `apps/backend/src/lib/env.ts`, `apps/backend/src/routes/ai.test.ts` (new)
  - Do: Move the transport half of `apps/mobile/src/lib/core/db/ai.ts` into `apps/backend/src/routes/ai.ts` as `createAiRouter(deps)` with `{ getSession?, chatSend?, borelFetch? }` injectable seams (factory takes optional fakes; defaults resolve to `auth.api.getSession({ headers })`, the real `@openrouter/sdk` `chatSend`, and a plain Borel `fetch`). Implement exactly per PLAN.md's Affected-Code bullet: session gate 401 `{ "error": "You need to sign in first." }`; chat service (lazy `OpenRouterCore`, call-time `openRouterApiKey()`, allowlist = set of distinct values of `ai.models`, exact unknown-model rejection object, `provider: { only: ["openai"] }`, retries off, 60s budget, `maxTokens` + camelCase media mapping, strict `response_format` for `jsonSchema`, schema-path-only 2-attempt retry/too-long/unreadable, schema-less `{ truncated: true, error: null }`, transport/status sentence table); transcribe service (pinned `qwen/qwen3-asr-0.6b`, `format` default `m4a`, 60s budget, cap 4194404 and empty-body `.trim()` guards with no provider call, noSpeech case, unknown body fields ignored); image proxy (both `/images/generations` and `/images/edits`, 150s budget, verbatim `Authorization`/`X-Borel-Surface`/`X-Borel-Build` forwarding, `refusalOf` sentences + per-endpoint fallbacks, `reused` true/false/null mapping, offline/timeout shapes, unconfigured `BOREL_AI_URL` shapes). Add `openRouterApiKey()` and `borelAiUrl()` to `lib/env.ts` as pure call-time `process.env` reads. Export the spec's type list from the router module (with the additive `reused` wire type). Do not mount in `app.ts` (T3 owns that).
  - Tests: `apps/backend/src/routes/ai.test.ts` (`bun:test`, no DB, no network): fake `getSession` rejecting → 401 exact body; all four unconfigured shapes with "provider seam not called"; chat request shape to the fake `chatSend` (`provider`, `maxTokens`, camelCase media, exact `response_format`), allowlist rejection (HTTP 200 + inner `status: 400`), retry/too-long/unreadable schema-path cases, schema-less truncation case, transport + status sentence table; transcribe guards with no provider call, pinned model/format; image proxy URL/body/header-forwarding (present and absent), three refusal sentences, plain-message and per-endpoint fallbacks, `reused` mapping, offline/timeout shapes. Plus one test that imports the real router module with real defaults (runtime import smoke check).
  - Done when: `bun test src/routes/ai.test.ts` passes in `apps/backend`; the new tests cover every listed behavior; `bun run typecheck` in `apps/backend` passes.

- [x] T2: Mobile thin client over the backend endpoints (commit 712f561)
  - Satisfies: AC-2 (config/env half), AC-6, AC-7, AC-11 (client half)
  - Files: `apps/mobile/src/lib/core/db/config.ts`, `apps/mobile/src/lib/core/db/ai.ts`, `apps/mobile/src/lib/core/db/ai.test.ts`
  - Do: Rewrite `ai.ts` as the thin client keeping every export verbatim (all ten types, `ai.models` both ids, `ai.chat`/`transcribe`/`image`/`editImage`): consent with the exact kind selection and `AI_DECLINED` decline, `sendableImage`/`sendableAudio` ownership with same sentences/caps, chat `input_audio` pass-through, image-only dedupe, metered post on `!reused` + strip, `noteRefusal` image-only, and a shared `aiRequest` layer sending to `BACKEND_AI_URL` with native `Cookie` + `credentials: "omit"` / browser `credentials: "include"`, image-only Borel headers (`Content-Type`, `X-Borel-Surface` always, `X-Borel-Build` when present, `Authorization` only when the bearer is non-empty, omitted otherwise), client timeouts 65000/160000ms, and the exact slow/offline/401/unconfigured sentences (401: body's `error` when readable else `"Sign in to use this feature."`; unset URL: `"The backend is not configured."` before any request). Remove `OPENROUTER_API_KEY`/`BOREL_AI` reads; add `BACKEND_AI_URL` to `config.ts`. Chat `transcribe` wire body sends only `{ audio: { data, format } }` (drop `language`/`prompt`). `consent.ts` untouched.
  - Tests: `apps/mobile/src/lib/core/db/ai.test.ts` rewrite: transport cases replaced by thin-client cases (both surfaces' base URL/cookie/credentials, image Borel headers incl. conditional `Authorization`, consent gate before fetch, exact fallback sentences for timeout/offline/401/unconfigured, image-only dedupe + no `editImage` dedupe, `noteRefusal` on image reason only, metered post on `reused: false` and `reused: null`, transcribe wire body drops `language`/`prompt`), plus the AC-11 case-sensitive source scan (lowercase `openrouter.ai` nowhere under `apps/mobile/src` except `consent.ts`).
  - Done when: `bun test ai.test.ts consent.test.ts` passes in `apps/mobile`; mobile `lint` and `typecheck` pass (the removed SDK read breaks nothing until T4 drops the dep).

## Wave 2
- [x] T3: Backend wiring: mount `/api/ai` with CORS and gate tests (commit af3d711)
  - Satisfies: AC-1, AC-8, AC-10 (real-gate cases)
  - Files: `apps/backend/src/app.ts`, `apps/backend/src/app.test.ts`, `apps/backend/src/routes/router.test.ts`
  - Do: Import `createAiRouter` from `./routes/ai.js`; add `app.use("/api/ai/*", cors({ origin: trustedOrigins(), credentials: true }))` and `app.route("/api/ai", aiRouter)` beside the data wiring. Extend `app.test.ts`: POST without a cookie to each of the four `/api/ai` paths returns 401 with exactly `{ "error": "You need to sign in first." }`; AC-8 CORS pair with the hermetic `TRUSTED_ORIGINS=http://localhost:8081` helper (OPTIONS 204 with both allow headers; credentialed POST same headers + 401 body). Extend `routes/router.test.ts` under the existing `test.skipIf(noDb)` guard: sign in, then authorized `POST /api/ai/chat` returns 200 with a result object; cookie-less call returns the exact 401 body.
  - Tests: the `app.test.ts` and `router.test.ts` additions named above.
  - Done when: `bun test src/app.test.ts src/routes/router.test.ts` passes (router additions skip with the reported reason when no DB); backend `lint`, `typecheck`, and `test` pass.
  - Depends: T1

- [x] T4: Dependency move and env key repoint (commit e9d83f6)
  - Satisfies: AC-2 (env files), AC-9, AC-11 (dependency removal)
  - Files: `apps/backend/package.json`, `apps/mobile/package.json`, `bun.lock`, `/app/.env.example`, `/app/.env`
  - Do: Add `"@openrouter/sdk": "^1.4.18"` to backend `dependencies`; drop it from mobile `dependencies` and remove the `@openrouter/sdk` segment from the Jest `transformIgnorePatterns` regex (keep the `zod` segment); run `bun install` at the root so `bun.lock` records the swap. In `.env.example`, remove the `EXPO_PUBLIC_OPENROUTER_API_KEY` and `EXPO_PUBLIC_BOREL_AI` lines and add `OPENROUTER_API_KEY` and `BOREL_AI_URL` under the `# Backend (apps/backend)` section; in the root `.env`, apply the same swap carrying over the existing values (`OPENROUTER_API_KEY` gets the old `EXPO_PUBLIC_OPENROUTER_API_KEY` value; `BOREL_AI_URL` gets the old `EXPO_PUBLIC_BOREL_AI` value).
  - Tests: none (no unit-testable logic; verified by gates and typecheck, which now fails on any surviving SDK import).
  - Done when: `bun install` exit 0; `bun run typecheck` passes in both workspaces (proving no surviving SDK import in mobile); `apps/mobile/package.json` no longer lists the SDK; both env files carry the exact four-key change.
  - Depends: T1, T2

## Wave 3
- [x] T5: Whole-feature quality gates and end-to-end verification (commits see SPEC Verification; no fix-forward needed)
  - Satisfies: AC-10 (gate matrix), and evidences AC-1 through AC-9 end to end
  - Files: none expected (fix-forward only if a gate fails)
  - Do: Run the full matrix from the root: `bun run lint`, `bun run typecheck`, `bun run test` (backend `bun test`, mobile Jest), then `bun run build` last; boot `bun run dev` in `apps/backend` and curl `GET /health`, an unauthorized `POST /api/ai/chat` (expect the exact 401 body), and with `TRUSTED_ORIGINS=http://localhost:8081` a preflight `OPTIONS /api/ai/chat` (expect 204 + allow headers); record the Verification section of SPEC.md per AC. Fix any failing criterion by sending one correction to an implementation subagent, re-verify, and commit the fix.
  - Tests: no new tests; validation runs every project check.
  - Done when: all root gates exit 0; the curl checks return the specified outcomes; every AC appears with pass evidence in SPEC.md.
  - Depends: T3, T4

## Coverage
- AC-1: T1, T3, T5
- AC-2: T1, T2, T4
- AC-3: T1, T3
- AC-4: T1
- AC-5: T1
- AC-6: T2
- AC-7: T2, T5
- AC-8: T3, T5
- AC-9: T4
- AC-10: T1, T2, T3, T5
- AC-11: T2, T4
