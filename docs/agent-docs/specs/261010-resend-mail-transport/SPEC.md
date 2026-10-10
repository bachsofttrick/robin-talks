# Spec: Send OTP email through the Resend SDK

Status: verified
Request: implement resend librayr for mail sending ability of backend. Review only spec and plan with `adversarial-agent` until both reach an agreement. Afterwards, approve tasks. No human will be involved in this loop.
You have dev environment already set up. don't need to input anything to env file. First, consult context7 and online docs regarding resend library.

## Overview
The backend mails one-time passwords through `createOtpTransport` in
`apps/backend/src/lib/mail/otp-transport.ts`. That module has a development
transport, which logs the code and pushes it to an in-process `outbox`, and a
"provider" transport that posts a bare `{ from, to, otp, type }` JSON body to
`https://api.<provider>.com/emails`. That body is not a valid email request for
any real provider, so no mail is ever delivered. This feature replaces the
provider transport with the official `resend` Node SDK: when mail is configured
for Resend, the backend sends a real email whose subject and body carry the
code, and when it is not, the existing dev transport keeps working. The change is
confined to the backend; the mobile app and the `createOtpTransport` seam are
unchanged. This supersedes the "specific production email vendor" non-goal of the
verified auth feature (`docs/agent-docs/specs/261006-move-auth-to-hono-backend/`)
while preserving its AC-12 transport-selection contract.

## User Stories
- As the Robin Talks developer, I want the backend to send OTP codes through Resend, so email verification and password reset deliver real email in production.
- As a learner, I want a clear, correctly formatted OTP email, so I can verify my address or reset my password without confusion.
- As an operator, I want the mail transport selected by environment, so local development keeps the in-process outbox and production sends through Resend without a code change.
- As an operator, I want a Resend rejection or a missing configuration to fail loudly, so an undelivered code is visible instead of silently dropped.
- As a developer, I want the Resend key to stay backend-only and out of logs, so credentials are never exposed.

## Acceptance Criteria
- AC-1 (dependency declared): `apps/backend/package.json` declares the official `resend` package as a runtime dependency, the root `bun.lock` records it and its transitive dependencies, and `resend` is imported only by the backend mail transport. The backend `typecheck` and `build` succeed with the dependency installed.
- AC-2 (transport selection): `createOtpTransport(config)` keeps its current signature and returns the development transport when `config.provider` is unset; when `config.provider === "resend"` it returns the Resend transport; when `config.provider` is any other non-empty value it throws an error naming the unsupported provider. The development transport is unchanged: it logs the code and pushes `{ email, otp, type }` to the exported `outbox`, and `resetOutbox()` clears it.
- AC-3 (Resend send): the Resend transport's `send({ email, otp, type })` constructs one Resend client and calls the Resend SDK `emails.send` once with `from` from the config, `to` set to the recipient email, and a per-type `subject`, `text`, and `html`; the code appears in both bodies. The client is constructed inside `send`, after the completeness check of AC-5, and always with the config's non-empty `apiKey` as an explicit constructor argument; the transport never relies on the SDK's `RESEND_API_KEY` environment fallback. `send` awaits the `{ data, error }` result and resolves on success (`error` null). Because the SDK returns errors instead of throwing, an `error` result is converted to a thrown `Error` whose message carries the Resend error text, extracting the first available of `error.message`, `error.error`, or `error.name` (every Resend error object carries at least one).
- AC-4 (content per OTP type): each of the four `OtpType` values (`sign-in`, `email-verification`, `forget-password`, `change-email`) maps to a subject, and the shared body template interpolates the code. The four subjects are pairwise distinct and non-empty, and the body (both `text` and `html`) contains the code. The mapping is a pure, unit-testable function; the exact strings are fixed in the plan.
- AC-5 (incomplete configuration): when `provider === "resend"` but `apiKey` or `from` is missing, `send` throws an error naming the missing configuration ("not fully configured") before constructing a Resend client or making any request, so the SDK's own key autodetect cannot mask the missing config.
- AC-6 (secret handling): the Resend API key is read from the backend environment through the existing `MAIL_API_KEY` variable and is passed only to the Resend client constructor, as its sole argument. The key is never logged: it appears in no `console.*` output during a send. No secret is written into the repository.
- AC-7 (env documentation): `.env.example` documents that `MAIL_PROVIDER=resend` with `MAIL_API_KEY` and `MAIL_FROM` enables real delivery through Resend, and that an unset `MAIL_PROVIDER` keeps the development transport. The `MAIL_*` variable names are unchanged.
- AC-8 (unit tests and quality gates): `apps/backend/src/lib/mail/otp-transport.test.ts` is updated so it no longer asserts the removed generic `fetch` path and instead covers selection (dev, Resend, unsupported), per-type content mapping, a successful Resend send, a Resend `error` result, and incomplete configuration. The Resend module is mocked with `bun:test`'s `mock.module`, so the suite needs no network. Backend `lint`, `typecheck`, and `test` pass; `build` succeeds.

## Edge Cases
- `MAIL_PROVIDER` unset while `MAIL_API_KEY` and `MAIL_FROM` are set: the development transport is selected (the provider field is the switch), so no accidental send occurs.
- `MAIL_PROVIDER=resend` with an empty `MAIL_API_KEY` or `MAIL_FROM` (the current root `.env` state): the Resend transport is selected and `send` rejects with the "not fully configured" error, without a network call.
- Unknown `MAIL_PROVIDER` (for example `sendgrid`): `createOtpTransport` throws an unsupported-provider error instead of silently using the dev transport.
- Provider matching is exact and case-sensitive: `RESEND`, `Resend`, or ` resend ` are treated as unknown providers and throw, so the accepted spelling is a single documented value (`resend`).
- Resend returns a populated `error` object in any of its shipped shapes: `send` rejects with a message that includes the Resend error text (from `message`, `error`, or `name`, whichever is present), never bare `undefined`.
- A network or transport failure: the Resend SDK's request layer catches it and returns it as an `error` result, so it is thrown through the same error-to-throw conversion as any other Resend error; if `emails.send` ever rejects directly, the rejection propagates to the caller unchanged.
- Friendly-name sender (`Robin <hi@example.com>`): passed through in `from` unchanged; Resend accepts it.
- Every `OtpType` value renders: `sign-in`, `email-verification`, `forget-password`, and `change-email` each produce a non-empty subject and a body containing the six-digit code.
- Verification email sent during local development with no Resend key: still captured in the `outbox`, so the database-backed auth tests continue to pass.

## Non-Goals
- Other mail providers (SendGrid, Postmark, Amazon SES); Resend is the only provider this feature implements.
- React Email components, Resend hosted templates, or the `react`/`template` send parameters.
- Scheduling, attachments, tags, custom headers, inbound mail, or delivery webhooks.
- Changing the `createOtpTransport` seam signature, the `outbox`-based development behavior, or the `MAIL_*` environment variable names.
- Any mobile-app or client change; the app never sees the mail transport.
- Amending the verified auth spec (`261006-move-auth-to-hono-backend/`); this feature supersedes only its email-vendor non-goal and keeps its AC-12 selection behavior.

## Open Questions
- Q-1: Should the Resend API key use the vendor-canonical name `RESEND_API_KEY` instead of the existing `MAIL_API_KEY`? Decision: keep `MAIL_API_KEY` to preserve the verified auth spec's AC-12 contract and avoid environment churn; the Resend docs' name is a convention, not a requirement. (blocks: nothing)
- Q-2: Should an unsupported provider throw or fall back to the development transport? Decision: throw, so a misconfiguration is loud rather than silently dropping mail. (blocks: AC-2)

## Verification
- AC-1: pass (grep for `from "resend"` returns one real importer, `apps/backend/src/lib/mail/otp-transport.ts:1`; `apps/backend/package.json:21` declares `"resend": "^6.32.1"`; `bun.lock` records `resend@6.32.1` plus `postal-mime@2.7.6` and `standardwebhooks@1.1.1`; backend `bun run typecheck` exit 0 and `bun run build` exit 0)
- AC-2: pass (`/tmp/verify-resend.ts`: `createOtpTransport({})` pushed `{email,otp,type}` to `outbox` and `resetOutbox()` cleared it; an unset provider with `apiKey`/`from` set stayed on the dev transport; `"sendgrid"`, `"RESEND"`, and `" resend "` each threw `Unsupported mail provider: <value>`)
- AC-3: pass (real Resend SDK with a stubbed `globalThis.fetch`: one `POST https://api.resend.com/emails`, `Authorization: Bearer <config key>`, body `{from,to,subject,text,html}` with the code in both bodies; a decoy `RESEND_API_KEY` was ignored so the config key is the sole constructor argument; a stubbed `error` result produced `Resend rejected the request: domain not verified`)
- AC-4: pass (real `renderOtpEmail` for all four types returned pairwise-distinct non-empty subjects matching the plan, and both `text` and `html` contained the code)
- AC-5: pass (`createOtpTransport({provider:"resend",from:"a@b.c"}).send(...)` and the missing-`from` case each rejected with `Mail provider is not fully configured: apiKey and from are required`, and the fetch capture stayed `null`, so no client or request was made)
- AC-6: pass (`MAIL_API_KEY` is read only in `apps/backend/src/lib/env.ts:67` and passed solely to `new Resend(apiKey)` at `otp-transport.ts:67`; the dummy key appeared in no `console.*` output during a send; repo greps for `re_[A-Za-z0-9]{10,}` in `apps/` and `docs/` returned nothing; `MAIL_API_KEY=` in `.env.example` is empty and root `.env` is gitignored)
- AC-7: pass (`.env.example:24-29` documents `MAIL_PROVIDER=resend` with `MAIL_API_KEY` and `MAIL_FROM` for Resend delivery and an empty `MAIL_PROVIDER` for in-process logging; the three `MAIL_*` names are unchanged)
- AC-8: pass (`bun test src/lib/mail/otp-transport.test.ts` -> `12 pass, 0 fail`; the test mocks `resend` with `mock.module` before `await import`, no network; backend `bun run lint` exit 0, `bun run typecheck` exit 0, `bun test` -> `141 pass, 1 fail`, `bun run build` exit 0)

Pre-existing failure, outside this feature: `apps/backend/src/app.test.ts` AC-4 times out because `src/index.ts` calls `requireDatabaseUrl()` only under `NODE_ENV=production` while the test uses `NODE_ENV=test`; `git show main:apps/backend/src/index.ts` is identical, so the failure predates this feature and no other test fails.

