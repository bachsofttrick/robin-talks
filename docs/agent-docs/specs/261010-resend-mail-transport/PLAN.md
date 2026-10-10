# Plan: Send OTP email through the Resend SDK

Status: approved
Spec: SPEC.md

## Approach
Replace the generic `fetch`-based `createProviderTransport` in
`apps/backend/src/lib/mail/otp-transport.ts` with a `createResendTransport` that
uses the official `resend` Node SDK. Add a pure `renderOtpEmail(payload)` helper
that maps each `OtpType` to a subject and a `text`/`html` body containing the
code. Keep the `createOtpTransport(config)` seam: unset `provider` returns the
unchanged development transport; `"resend"` returns the Resend transport; any
other value throws. The Resend client is built inside `send` after a
completeness check, and a populated `{ data, error }` result becomes a thrown
`Error`. Only `otp-transport.ts`, its test, `.env.example`, and
`apps/backend/package.json` (plus the root `bun.lock`) change. This serves
AC-1 through AC-8.

## Affected Code
- `apps/backend/package.json`: add `"resend"` to `dependencies` (installed with
  `bun add resend`, which also updates the root `bun.lock`). Serves AC-1.
- `apps/backend/src/lib/mail/otp-transport.ts`: remove `createProviderTransport`
  and its `fetch` call; add `renderOtpEmail`, `createResendTransport`, and the
  unsupported-provider branch in `createOtpTransport`. Serves AC-2 through AC-6.
- `apps/backend/src/lib/mail/otp-transport.test.ts`: replace the generic
  provider-transport tests with Resend SDK-mocked tests plus a `renderOtpEmail`
  test. The send test also spys on `console.*` and asserts the key never appears
  (AC-6). Serves AC-8.
- `.env.example`: annotate the `MAIL_*` block that `MAIL_PROVIDER=resend` with
  `MAIL_API_KEY` and `MAIL_FROM` sends real mail and an unset `MAIL_PROVIDER`
  keeps the dev transport. Serves AC-7.
- No change to `apps/backend/src/lib/env.ts`; `mailConfig()` already reads
  `MAIL_PROVIDER`, `MAIL_API_KEY`, and `MAIL_FROM`.

## Data Model and Contracts
Existing types are kept:

```ts
type MailConfig = { provider?: string; apiKey?: string; from?: string };
type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";
type OtpPayload = { email: string; otp: string; type: OtpType };
type OtpTransport = { send(payload: OtpPayload): Promise<void> };
```

New pure helper (exported for a direct unit test):

```ts
export function renderOtpEmail(payload: OtpPayload): { subject: string; text: string; html: string };
```

Exact strings (fixed here per AC-4):

| type | subject |
|---|---|
| `sign-in` | `Your Robin Talks sign-in code` |
| `email-verification` | `Verify your Robin Talks email` |
| `forget-password` | `Reset your Robin Talks password` |
| `change-email` | `Confirm your new Robin Talks email` |

Body (same for every type, code interpolated):

- `text`: `Your Robin Talks code is <code>. It expires in 5 minutes. If you didn't request this, you can ignore this email.`
- `html`: `<p>Your Robin Talks code is <strong><code></strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`

`<code>` is the 6-digit OTP, emitted by better-auth, so it is numeric; the helper
still runs it through a two-line `escapeHtml` before interpolation so the HTML
template is safe if a code shape ever changes.

Transport selection and send contract:

```ts
export function createOtpTransport(config: MailConfig): OtpTransport {
  if (!config.provider) return createDevTransport();
  if (config.provider === "resend") return createResendTransport(config);
  throw new Error(`Unsupported mail provider: ${config.provider}`);
}
```

`createResendTransport(config).send(payload)`:

1. Read `const { apiKey, from } = config`; if either is missing, throw
   `Mail provider is not fully configured: apiKey and from are required` (keeps
   the word "not fully configured" the existing test matches) before touching the
   SDK.
2. `const resend = new Resend(apiKey)` with the config's key as the only
   argument, so the SDK's `RESEND_API_KEY` autodetect is never used.
3. `const { subject, text, html } = renderOtpEmail(payload)`.
4. `const { error } = await resend.emails.send({ from, to: payload.email, subject, text, html })`.
5. If `error`, throw `new Error(\`Resend rejected the request: ${messageOf(error)}\`)`
   where `messageOf(error)` returns `error.message ?? error.error ?? error.name`.

## Libraries
- `resend` (latest `6.32.1`, resolved by `bun add resend`): official Node SDK,
  `import { Resend } from "resend"`, `new Resend(apiKey)`,
  `resend.emails.send({ from, to, subject, text, html })` returning
  `{ data, error }` and not throwing on API errors. Node `>=20` engine, satisfied
  by Bun. TypeScript types ship with the package; verified against the official
  docs (`https://resend.com/docs/send-with-nodejs`) and Context7 `/websites/resend`.
- `bun:test` `mock.module`: the test replaces the `resend` module with a fake
  `Resend` class, following the pattern in
  `apps/backend/src/routes/ai/ai.test.ts:21-38` (declare `mock.module` before a
  dynamic `await import` of the module under test).

## Risks
- `resend` fails to install without network: `bun add resend` needs the registry; `npm view resend version` succeeded in this environment, so the registry is reachable. If install fails, implementation stops and reports rather than hand-editing `bun.lock`.
- SDK error object shape varies (`{ message, name }` vs `{ statusCode, error, name }`): the `message ?? error ?? name` extraction in AC-3 covers both; the test exercises a shape with no `message`.
- `mock.module("resend")` must register before the module under test loads, or the real `Resend` binds: the test registers the mock then imports `otp-transport.js` with `await import`, as `ai.test.ts` does. Other test files import `otp-transport.js` statically and only exercise the dev transport, so they are unaffected.
- Importing `resend` in a database-less test run: the package loads with no side effects or network at import; only `emails.send` reaches the network, and tests never call it against the real SDK.
- The SDK ships React Email types that could pull `react` into the backend build: the transport uses only the string `text`/`html` path, and the backend `tsconfig.build.json` compiles with `skipLibCheck`, so no React dependency is added. Verify `build` in AC-8.
- Serverless/bundling constraints do not apply; the backend runs on Bun directly.
