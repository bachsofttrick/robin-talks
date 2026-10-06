# Tasks: Turborepo monorepo setup

Status: complete
Plan: PLAN.md

All paths are relative to the repository root. Root scripts are `bun run <script>`
at the repository root; mobile scripts run from `apps/mobile`. Node 26 and
Bun 1.4.2 are installed. Neither implementation nor testing subagents run git
commands.

## Wave 1

- [x] T1: Root workspace and task graph (commit 67ba60b)
  - Files: `package.json` (create at repo root), `turbo.json` (create at repo
    root), `.gitignore` (add `.turbo/`)
  - Do:
    1. Create the root `package.json`: `"name": "robin-talks-monorepo"`,
       `"private": true`, `"version": "1.0.0"`,
       `"workspaces": ["apps/*"]`, `"packageManager": "bun@1.4.2"`, and
       `devDependencies: { "turbo": "^2.11.7" }`.
    2. Scripts that delegate to Turborepo: `"build": "turbo run build"`,
       `"dev": "turbo run start"`, `"lint": "turbo run lint"`,
       `"typecheck": "turbo run typecheck"`, `"test": "turbo run test"`,
       plus `"env:link": "bun scripts/link-env.mjs"` (the script itself lands
       in T3).
    3. Create `turbo.json` with `"$schema": "https://turborepo.dev/schema.json"`
       and these tasks: `build` (`dependsOn: ["^build"]`,
       `outputs: ["dist/**"]`), `typecheck` (`dependsOn: ["^typecheck"]`),
       `lint` (`dependsOn: ["^lint"]`), `test` (`dependsOn: ["^test"]`),
       `start` (`cache: false`, `persistent: true`,
       `dependsOn: ["//#env:link"]`), and the root task `"//#env:link": {}`.
    4. Add `.turbo/` to the root `.gitignore`.
  - Tests: none new. The root has no test runner (Jest is scoped to
    `apps/mobile`), so verification is `bunx turbo run lint typecheck test
    --dry=json` at the root plus a `--dry` run of `start`.
  - Done when: the root `package.json` and `turbo.json` are valid JSON, no
    dependency install has been attempted yet, and `bunx turbo run lint
    typecheck test start --dry=json` from the root exits 0 and reports
    `lint`, `typecheck`, and `test` tasks for `@robin-talks/mobile`, a `build`
    task for `@robin-talks/backend`, a persistent `start` task for
    `@robin-talks/mobile`, and a root `//#env:link` task that `start` depends
    on.

- [x] T2: Normalize workspace manifests (commit c49b396)
  - Files: `apps/mobile/package.json`, `apps/backend/package.json`
  - Do:
    1. `apps/mobile/package.json`: rename the package from `robin-talks` to
       `@robin-talks/mobile`. Keep `version`, `private`, `main: "expo-entry.js"`,
       every dependency and devDependency, the `jest` block, and every script
       (`start`, `android`, `ios`, `web`, `typecheck`, `lint`, `test`) exactly
       as they are. Do not add a `build` or `dev` script.
    2. `apps/backend/package.json`: rename the package from `hono` to
       `@robin-talks/backend`, add `"private": true`, and add the scripts
       `"typecheck": "tsc --noEmit"` and `"build": "tsc"`. Keep `"type": "module"`,
       the existing `dev` script, and all dependencies as they are.
  - Tests: none. Manifest metadata has no unit-testable surface; verification is
    `bun run typecheck` and `bun run build` inside `apps/backend` exiting 0 and
    emitting `apps/backend/dist/index.js`.
  - Done when: the three package names (`robin-talks-monorepo`,
    `@robin-talks/mobile`, `@robin-talks/backend`) are distinct, both manifests
    are valid JSON, `apps/backend` typechecks and builds cleanly, and the mobile
    script list is byte-identical to its current state apart from the package
    name.

## Wave 2

- [x] T3: One shared root `.env` (commit b10aee5)
  - Files: `scripts/link-env.mjs` (create), `.env` (move from
    `apps/mobile/.env`, git-ignored), `.env.example` (move from
    `apps/mobile/.env.example`, committed), delete `apps/mobile/.env.example`,
    `apps/mobile/.env` (relative symlink to `../../.env`),
    `apps/backend/.env` (relative symlink to `../../.env`)
  - Do:
    1. Move the developer's `apps/mobile/.env` to the repository root as
       `.env`, and move `apps/mobile/.env.example` to the root as
       `.env.example`. Both are already covered by the root `.gitignore` rules
       `.env` and `.env.local`, so no ignore change is needed. Preserve the file
       contents byte for byte.
    2. Create `scripts/link-env.mjs`, a plain Node ESM script (run with
       `bun scripts/link-env.mjs`, so no dependencies and no TypeScript). For
       each workspace directory `apps/mobile` and `apps/backend` it:
       - reads the root `.env` first and exits 0 with a short message when the
         root `.env` does not exist, creating nothing;
       - removes an existing `apps/<name>/.env` when it is a symlink or a file,
         then creates the relative symlink `../../.env` pointing at the root file;
       - creates the link only when it is missing or points somewhere else, so a
         second run changes nothing;
       - prints one line per workspace it linked and exits 0.
       Use `node:fs` (`lstatSync`, `unlinkSync`, `symlinkSync`, `readFileSync`)
       and `node:path`. Keep it under 60 lines, no framework, no config.
    3. Run `bun run env:link` from the root once so both symlinks exist for
       local development.
  - Tests: none. There is no test runner at the repository root, so the script
    is verified by running it: `bun run env:link` exits 0, `readlink
    apps/mobile/.env` and `readlink apps/backend/.env` both print `../../.env`,
    reading `apps/mobile/.env` yields the same bytes as the root `.env`, a
    second run prints that nothing changed and still exits 0, and
    `git status --porcelain` shows no `.env` file as untracked or modified. Do
    not delete the root `.env` to test the missing-file path.
  - Done when: the root `.env` and `.env.example` exist and are the only real
    env files in the repository, both workspace `.env` entries are relative
    symlinks to `../../.env`, `bun run env:link` is idempotent, and
    `apps/mobile/.env.example` no longer exists.

## Wave 3

- [x] T4: Single root install and lockfile (commit 4db6ace)
  - Files: `bun.lock` (create at repo root), `apps/mobile/bun.lock` (delete),
    `apps/backend/bun.lock` (delete), `apps/mobile/node_modules` (delete,
    git-ignored), `apps/backend/node_modules` (delete, git-ignored)
  - Do:
    1. Delete `apps/mobile/bun.lock` and `apps/backend/bun.lock`, then
       `apps/mobile/node_modules` and `apps/backend/node_modules`. Also delete
       `apps/backend/pnpm-workspace.yaml`, the leftover pnpm build-approval
       config that has no meaning under Bun workspaces.
    2. Run `bun install` once at the repository root. It must produce a single
       root `bun.lock` and a root `node_modules`, with per-workspace
       `node_modules` only where two workspaces need different versions of the
       same package (TypeScript 6 and TypeScript 7 both resolve). Do not add or
       change any dependency version to make the install pass; if it fails,
       report the error instead of working around it.
    3. Verify the hoisted install from both directions: from the repository
       root `bun run typecheck`, `bun run lint`, and `bun run test` all exit 0,
       and inside `apps/mobile` `bun run typecheck`, `bun run lint`, and
       `bun run test` also exit 0.
  - Tests: no new unit tests; run the existing suites. The mobile suite must
    still report 5 suites and 56 tests through `turbo run test`.
  - Done when: exactly one `bun.lock` exists, at the repository root, no
    `bun.lock` or `node_modules` remains inside a workspace except a
    `node_modules` that only holds a version conflict, `apps/backend/pnpm-workspace.yaml`
    is gone, and the root `bun run lint`, `bun run typecheck`, and
    `bun run test` all exit 0 with the mobile suite at 5 suites and 56 tests.

## Build check

`bun run build` at the repository root (Turborepo `build` task) runs after
Wave 3. It maps to `apps/backend`'s `tsc` build, since the Expo app has no
build script.

Result: exit 0. `bun run build` from the root emits `apps/backend/dist/index.js`
(290 bytes), compiled by `apps/backend/node_modules/typescript` 7.0.2. The Expo
app declares no `build` script, so Turborepo reports `@robin-talks/mobile:build`
as non-existent by design.

## Deviations from the plan

Two changes were required that the plan did not anticipate. Both were approved
and verified:

- `bunfig.toml` (new, repo root) with `[install] linker = "hoisted"`. Bun 1.4
  defaults a new workspace to the isolated linker, which materializes a
  `node_modules/.bun` store; the mobile Jest `transformIgnorePatterns`
  allow-list matches on a `/node_modules/` prefix, so the store path defeated it
  and all 5 suites failed with `Cannot use import statement outside a module`.
- `typescript: "~6.0.3"` in the root `devDependencies`. Under the hoisted layout
  the backend's TypeScript 7 landed at the root, where `@typescript-eslint` and
  `ts-api-utils` resolve it and crash on its missing `ts.Intrinsic`
  (`bun run lint` exited 2). Pinning TypeScript 6 at the root restores ESLint
  while `apps/backend` keeps TypeScript 7 nested for its own build.