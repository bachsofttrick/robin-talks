# Tasks: Send OTP email through the Resend SDK

Status: complete

## Wave 1
- [x] T1: Add the resend runtime dependency (commit cb80f7a)
  - Satisfies: AC-1
  - Files: `apps/backend/package.json`, `bun.lock`
  - Do: From `apps/backend`, run `bun add resend` so the official package is recorded under `dependencies` in `apps/backend/package.json` and the root `bun.lock` is updated with `resend` and its transitive packages. Do not hand-edit `bun.lock`, do not pin an old version, and do not add any other dependency. Change no source file.
  - Tests: none (a dependency declaration carries no unit-testable behavior; the code that uses it is T3's).
  - Done when: `apps/backend/package.json` lists `"resend"` under `dependencies`; the root `bun.lock` records it; `bun run typecheck` in `apps/backend` exits 0.

- [x] T2: Document the Resend mail configuration in .env.example (commit d4e13f3)
  - Satisfies: AC-7
  - Files: `.env.example`
  - Do: In the `# Backend (apps/backend)` block keep the existing `MAIL_PROVIDER`, `MAIL_API_KEY`, and `MAIL_FROM` lines with their empty values, and add concise comments stating: setting `MAIL_PROVIDER=resend` with `MAIL_API_KEY` (a Resend API key) and `MAIL_FROM` (a verified sender, for example `Robin <no-reply@yourdomain.com>`) makes the backend send OTP email through Resend; leaving `MAIL_PROVIDER` empty logs codes in-process. Match the file's existing comment style; avoid em dashes.
  - Tests: none (documentation-only).
  - Done when: `.env.example` documents both behaviors and no unrelated line changed.

## Wave 2
- [x] T3: Implement the Resend transport in otp-transport.ts (commit dbbc10b)
  - Satisfies: AC-2, AC-3, AC-4, AC-5, AC-6, AC-8
  - Files: `apps/backend/src/lib/mail/otp-transport.ts`, `apps/backend/src/lib/mail/otp-transport.test.ts`
  - Do: Implement the plan's "Data Model and Contracts" exactly. Remove `createProviderTransport` and its `fetch` call. Add `import { Resend } from "resend"`; add an exported pure `renderOtpEmail(payload)` returning the fixed per-type `subject` and the shared `text`/`html` body with the code interpolated (run the code through a small `escapeHtml`); add `createResendTransport(config)` whose `send` checks `apiKey`/`from` first (throw `Mail provider is not fully configured: apiKey and from are required`), then constructs `new Resend(config.apiKey)`, calls `resend.emails.send({ from, to: payload.email, subject, text, html })`, and throws when the returned `error` is present using `error.message ?? error.error ?? error.name`. Update `createOtpTransport` to keep the dev transport for an unset `provider`, return the Resend transport for `"resend"`, and throw `Unsupported mail provider: <value>` otherwise. Keep `OtpType`, `OtpPayload`, `OtpTransport`, `outbox`, `resetOutbox`, and the dev transport unchanged.
  - Tests: rewrite `apps/backend/src/lib/mail/otp-transport.test.ts` using `bun:test`'s `mock.module("resend", ...)` (registering the fake `Resend` before `await import("./otp-transport.js")`, as `apps/backend/src/routes/ai/ai.test.ts:21-38` does): (1) `renderOtpEmail` returns a non-empty subject for each of the four types, the subjects are pairwise distinct, and `text` and `html` both contain the otp; (2) dev selection and `outbox`/`resetOutbox` behavior for unset `provider`, all four types handed through; (3) `provider: "resend"` selects the Resend transport; (4) `provider: "sendgrid"`, `"RESEND"`, and `" resend "` each throw `/unsupported/i`; (5) a successful send constructs `Resend` with the config key as its only argument and calls `emails.send` once with `{ from, to, subject, text, html }`, the otp present in both bodies, the outbox empty, and no `console.*` call receiving the key; (6) a `{ data: null, error: { message, name } }` result rejects with a message containing the error text; (7) a malformed `{ data: null, error: { name, error } }` result (no `message`) still rejects with a message containing the error text; (8) a missing `apiKey` or `from` rejects `/not fully configured/` with the fake `Resend` constructor and `emails.send` never called.
  - Done when: `bun test src/lib/mail/otp-transport.test.ts` passes, and backend `bun run lint` and `bun run typecheck` exit 0.

## Coverage
- AC-1: T1
- AC-2: T3
- AC-3: T3
- AC-4: T3
- AC-5: T3
- AC-6: T3
- AC-7: T2
- AC-8: T3
