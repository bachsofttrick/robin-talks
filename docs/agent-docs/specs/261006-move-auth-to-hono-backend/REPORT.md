# Report: Move auth into the Hono backend

Feature: `261006-move-auth-to-hono-backend`
Method: Spec-Driven Development (sdd), no plan mode, no human acceptance gates.
Review authority: `adversaral-agent` at every phase gate (spec, plan, tasks).
Status: `SPEC.md` verified, `TASKS.md` complete, with one verified update recorded in the spec's Change Log.

## Summary

The auth surface (accounts, sessions, email verification, password reset, password
change, account deletion) runs in the `@robin-talks/backend` Hono workspace using
better-auth 1.6.23 with a drizzle adapter over the provided Neon Postgres database
(AC-1 through AC-14). A follow-up update then repointed the native mobile auth client
at the backend and migrated the app's own data (learner profile, practice sessions,
Robin memory, and the profiles row) to authenticated backend endpoints, so the app no
longer depends on Borel for auth or its data (AC-15 through AC-20).

All 20 acceptance criteria passed verification. All quality gates are green:
backend `lint`, `typecheck`, `test` (78 tests), `build`; mobile `lint`, `typecheck`,
`test` (104 tests). File storage, AI image generation, moderation, notifications, and
the browser preview remain on Borel and are not called by the app's screens.

## Adversarial review passes: 17 total

Original feature (11):

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

Update: mobile repoint and data migration (6):

| Phase | Pass | Session result |
|---|---|---|
| Spec | 1 | Not approved. 9 blockers (B1-B9): false hook return shape, unpinned cookie-vs-bearer mechanism, unstated broken intermediate state, no deletion cascade, unenumerated columns, id-addressed scoping, browser branch contradiction, `profiles` key, stale AC-14. |
| Spec | 2 | Not approved. 5 blockers (N1-N5): `sessionCookieHeader()` races a cold start, wrong `freshAge` rationale, AC-1/AC-15 option mismatch, cookie name under https, unpinned id default. |
| Spec | 3 | 5 fixed; 1 remaining blocker: AC-11 still justified itself with the old 24-hour freshness default. |
| Spec | 4 | **Approved as amendment.** |
| Tasks | 1 | Not approved. 5 blockers (B1-B5): drizzle camelCase response keys, missing 401 test, vague isolation test, delete-by-id vs delete-all mismatch, mobile test cannot import the data client. |
| Tasks | 2 | **Approved as-is.** |

Every blocking issue was fixed and re-reviewed until the reviewer approved, with no
human sign-off used.

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

## Update: mobile repoint and data migration

The request moved the mobile app onto the backend auth and then migrated the app's
own data so the app keeps working. Classified as an **update** to a verified feature:
`SPEC.md` was reopened to `draft`, extended with AC-15 through AC-20 and revised
Overview/User Stories/Edge Cases/Non-Goals/Q-1, and approved by the reviewer before
any code changed.

### Phase 1-3 (update)

1. Scoped the data surface by grepping the mobile source: only `db.from` for
   `learner_profiles`, `practice_sessions`, `robin_memory`, and `profiles` is used by
   the screens; `db.storage`, `db.moderation`, `db.notify`, and `db.account` are
   exported but called by nothing, and `db.ai` chat/transcription already go straight
   to OpenRouter.
2. Amended `SPEC.md` (AC-15 mobile repoint, AC-16 schema, AC-17 data API, AC-18 mobile
   data layer, AC-19 end-to-end/isolation/cascade, AC-20 gates). Four adversarial
   review passes resolved: the false hook return shape, the cookie-vs-bearer mechanism
   (better-auth has no bearer path, so the client must replay the session cookie),
   the deletion cascade, the cold-start cookie-jar race (async `sessionCookieHeader()`),
   `session.freshAge: 0`, and the per-id scoping.
3. Appended an "Update" section to `PLAN.md` and waves T11-T15 to `TASKS.md`; two
   review passes resolved camelCase-vs-snake_case response keys, the missing 401 test,
   the isolation test, delete-by-id vs delete-all, and the mobile test import problem.

### Phase 4-5 (update)

| Task | Commit | Content |
|---|---|---|
| mobile repoint | `1112cc7` | `BACKEND_AUTH_URL`, backend auth client, backend `deleteUser`, `PASSWORD_RESET_AVAILABLE = true` |
| T11 | `479de46` | App tables + `0001` migration, cascade FKs, `session: { freshAge: 0 }` |
| T13 | `add00e9` | Async `sessionCookieHeader()`, `backendDataUrl()`, typed mobile data client + tests |
| T12 | `7978454` | `/api/data/*` router with session-cookie auth, snake_case projections, per-user scoping + tests |
| T14 | `eb47968` | Hooks and `syncProfile` route through the backend on native; browser keeps `db.from` + hook tests |
| T15 | verified, no changes | Root lint/typecheck/test/build all green |

Verification: AC-15 pass (auth e2e 9/9; mobile 104 tests), AC-16 pass (`db:verify`,
migration test 8/8), AC-17 pass (router test 8/8 incl. 401), AC-18 pass (mobile 7
suites / 104 tests), AC-19 pass (isolation + cascade), AC-20 pass (backend 78, mobile
104, build exit 0). `SPEC.md` restored to `Status: verified` with the update evidence
and a Change Log entry.

### Phase 6 (update)

One `codebase-explorer` subagent updated `CLAUDE.md`, `README.md`,
`docs/agent-docs/backend-and-ai.md`, `auth.md`, `api-layer.md`, `architecture.md`,
`directory-map.md`, and `workflows.md` to remove the "not repointed" claims and
document the backend data API. Committed with the spec artifacts as `43bc143`.

## Key technical decisions

- better-auth 1.6.23 pinned to match the committed drizzle schema and the mobile client.
- Hand-written camelCase drizzle schema for the better-auth tables (its exact
  `fieldName` defaults); the app tables use explicit snake_case columns.
- `database` uses the function form so the pool is lazy and DB-less test files still load.
- Migrations run on the unpooled host (Neon pooler breaks DDL); `sslmode=require` on composed URLs.
- OTP transport is an injectable seam with an inspectable outbox; provider sends via `fetch`.
- Database-backed tests skip with a reported reason when no database is configured.
- better-auth has no bearer path, so the mobile data client replays the persisted
  `better-auth.session_token` cookie; `sessionCookieHeader()` is async and awaits the
  jar load so a cold-start request still carries it.
- Every `/api/data/*` handler projects snake_case keys explicitly and scopes reads and
  writes to `user_id = session.user.id`; deletes are delete-all scoped to the caller.
- The four app tables carry `ON DELETE CASCADE` FKs to `"user"(id)`, so account
  deletion clears them; `session.freshAge: 0` keeps a long-lived session able to delete.
- The browser preview keeps Borel's `brokerAuth` and `db.from`, so native and browser
  remain separate stores.
