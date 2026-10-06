# Report: Move auth into the Hono backend

Feature: `261006-move-auth-to-hono-backend`
Method: Spec-Driven Development (sdd), no plan mode, no human acceptance gates.
Review authority: `adversaral-agent` at every phase gate (spec, plan, tasks).

## Summary

The auth surface (accounts, sessions, email verification, password reset, password
change, account deletion) now runs in the `@robin-talks/backend` Hono workspace using
better-auth 1.6.23 with a drizzle adapter over the provided Neon Postgres database.
The mobile app is intentionally not repointed; the backend proves endpoint
conformance with the mobile client's neon-js `SupabaseAuthAdapter` instead, because
the same session token also authorizes six Borel surfaces (Data API, storage, AI,
moderation, notifications, account deletion).

All 14 acceptance criteria passed verification. All quality gates are green
(backend `lint`, `typecheck`, `test`, `build`; mobile `lint`, `typecheck`, `test`).

## Adversarial review passes: 11 total

| Phase | Pass | Session result |
|---|---|---|
| Spec | 1 | Not approved. 10 blocking issues (B1-B10): false AC-9, AC-7/AC-9 contradiction, untestable criteria, missing dependency/env/test-infra ACs. |
| Spec | 2 | Not approved. 6 new blocking issues (N1-N6): `sendOnSignIn` mis-scoped, `delete-user` not enabled, duplicate sign-up behavior, AC-13 premise, DB-test idempotency, missing dev dep. |
| Spec | 3 | Not approved. 4 remaining blockers (B1-B4): adapter construction route, AC-14 skip vs AC-7-11, resend body type, session-cache ordering. |
| Spec | 4 | Not approved. 1 blocker: `createAuthClient` call signature/export path. |
| Spec | 5 | Not approved. 1 blocker: `createAuthClient` import subpath. |
| Spec | 6 | Content approved; only `Status: draft` remained. Set to `approved`. |
| Plan | 1 | Not approved. 9 blocking issues (B1-B9): build/tsconfig split, `.env` gaps, sslmode, subprocess env, env fail-fast, mail config, origin check, drizzle config, AC ownership. |
| Plan | 2 | Not approved. 5 remaining blockers: migration URL derivation, `baseURL` source, production secret rule, DB-free routing test, AC-3 ownership. |
| Plan | 3 | **Approved as-is.** All prior findings resolved and independently verified against installed packages. |
| Tasks | 1 | Not approved. 6 blockers (B1-B6): wave inversion, same-wave dependency, failing Done-when, missing AC-14 owner, missing test assertions, env precedence. |
| Tasks | 2 | **Approved as-is.** All resolved; coverage map verified both directions. |

Total: 6 spec passes, 3 plan passes, 2 tasks passes. Every blocking issue was fixed
and re-reviewed until the reviewer approved, with no human sign-off used.

## Phase 1: Specify

1. Explored the repo: `codegraph` for the auth symbols, then `apps/mobile/src/lib/core/db/auth.ts`, `auth/actions.ts`, `auth/context.tsx`, `db.ts`, `config.ts`, the auth docs, the backend scaffold, and the installed `@neondatabase/auth` / `@neondatabase/neon-js` / `better-auth` sources.
2. Queried the provided Neon database (empty; no user tables) and confirmed the credentials.
3. Consulted `context7` for better-auth (Hono mount, drizzle adapter, emailOTP plugin, password reset, schema), drizzle-orm (pg + migrations), and Hono.
4. Wrote `SPEC.md` with 14 ACs, edge cases, non-goals, and open questions.
5. Ran 6 adversarial review passes, resolving every blocker, then set `Status: approved`.

Notable spec corrections forced by review: replaced the untestable "mobile unchanged"
AC with an endpoint-conformance AC; added dependency, test-infrastructure, env-contract,
and change-password ACs; documented the full token blast radius in Q-1 and Non-Goals.

## Phase 2: Plan

1. Re-explored the affected code and installed package internals.
2. Fetched current drizzle and better-auth docs via `context7`.
3. Wrote `PLAN.md` (approach, affected code, data model/contracts, libraries, risks).
4. Ran 3 adversarial review passes. The reviewer verified API-level details against
   the installed sources and forced fixes to the tsconfig/build split, env contract,
   sslmode handling, subprocess test environment, lazy DB client, origin-check config,
   and the drizzle-kit URL derivation. Approved on pass 3.

## Phase 3: Tasks

1. Decomposed the plan into 10 tasks across 6 waves, each with Satisfies/Files/Do/Tests/Done-when.
2. Ran 2 adversarial review passes. Fixed a wave inversion (app after auth), a same-wave
   env dependency, a Done-when that would fail, AC-14 ownership, and the AC-7/9/10/11
   assertions. Approved on pass 2 with a correct Coverage map.

## Phase 4: Implement (one wave at a time, `mid-agent` subagents)

Implementation subagents changed production code only; testing subagents wrote the tests
and ran lint, typecheck, and the suite. Each task was committed separately.

| Task | Commit | Content |
|---|---|---|
| T1 | `feb8a7f` | Backend deps (better-auth 1.6.23, drizzle, pg), Bun test/build tsconfigs, env docs |
| T2 | `2364aca` | `src/env.ts` + tests |
| T3 | `4d32982` | `src/db/schema.ts` + tests |
| T4 | `26e96af` | `src/mail/otp-transport.ts` + tests |
| T5 | `55d0574` | `src/db/client.ts`, `index.ts` + tests |
| T6 | `0e900ce` | `drizzle.config.ts`, generated migration, migration test |
| T7 | `d43a380` | `src/auth.ts` + e2e core tests (AC-6, AC-8) |
| T8 | `aaa4b45` | e2e extension (AC-7, AC-9, AC-10, AC-11, edge cases) |
| T9 | `79eabe1` | `src/app.ts`, `src/index.ts`, routing + conformance tests |
| T10 | verified, no changes | Root lint/typecheck/test/build all green |

Spec/task progress recorded in `55150b4`. The suite grew to 64 backend tests.

## Phase 5: Verify

One verification subagent drove each AC end-to-end and reran the gates. All 14 passed:
AC-1 (live `curl` on health and auth), AC-2/AC-5 (deps and test infra), AC-3
(`db:verify`), AC-4 (subprocess exit), AC-6-AC-11 (in-process HTTP auth flows),
AC-12 (transport), AC-13 (route conformance + adapter recording), AC-14 (root gates,
build last). `SPEC.md` set to `Status: verified` with the evidence table.

## Phase 6: Document

One `codebase-explorer` subagent updated `CLAUDE.md` (AGENTS.md symlink intact),
`docs/agent-docs/backend-and-ai.md`, `auth.md`, `architecture.md`, `directory-map.md`,
`workflows.md`, and `README.md`. I additionally corrected stale `turbo run start`
references to `turbo run dev` across those files. Committed as `6ac9c09`.

## Key technical decisions

- better-auth 1.6.23 pinned to match the committed drizzle schema and the mobile client.
- Hand-written camelCase drizzle schema (better-auth's exact `fieldName` defaults);
  `camelCase` is declared but unread in the drizzle adapter, so it is omitted.
- `database` uses the function form so the pool is lazy and DB-less test files still load.
- Migrations run on the unpooled host (Neon pooler breaks DDL); `sslmode=require` on composed URLs.
- OTP transport is an injectable seam with an inspectable outbox; provider sends via `fetch`.
- Database-backed tests skip with a reported reason when no database is configured.
