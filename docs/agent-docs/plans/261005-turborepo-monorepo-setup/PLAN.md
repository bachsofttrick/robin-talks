# Plan: Turborepo monorepo setup

Status: approved
Request: "consult context7 on turborepo. Setup a monorepo for this existing project." Follow-up: "How do I get .env to be at the root folder to share among all repos."

## Approach
The repository already holds two workspaces under `apps/` (an Expo app and a Hono
scaffold) but has no root manifest, no lockfile at the root, and no task runner, so
the "monorepo" exists only as a directory convention. This change adds the missing
root layer following the Turborepo documentation for a Bun-workspaces repo: a
private root `package.json` declaring `workspaces: ["apps/*"]`, `turbo` as the only
root devDependency, and root scripts that delegate to `turbo run <task>`; a
`turbo.json` declaring the `build`, `typecheck`, `lint`, `test`, and persistent
`start` tasks; normalized per-workspace manifests so both packages carry scoped
names and the scripts Turborepo needs; and a single root `bun.lock` produced by
installing from the root after removing the two per-package lockfiles and stray
pnpm config. The same root layer owns the environment file: one git-ignored `.env`
at the repository root is the single source of truth, and an idempotent root
script links it into each workspace so Expo's dotenv resolution and Bun's
cwd-based loader both find it without copying secrets.

## Affected Code
- `package.json` (new, repo root): private, `name: robin-talks-monorepo`,
  `workspaces: ["apps/*"]`, `packageManager: bun@1.4.2`, devDependency
  `turbo@^2.11.7`, scripts `build`, `dev`, `lint`, `typecheck`, `test` delegating to
  `turbo run`, and `env:link` running the link script.
- `turbo.json` (new, repo root): `$schema`, `globalDependencies`, and tasks
  `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**"]`), `typecheck`, `lint`,
  `test`, `start` (`cache: false`, `persistent: true`,
  `dependsOn: ["//#env:link"]`), and the root task `//#env:link`.
- `scripts/link-env.mjs` (new, repo root): idempotent Node script that points
  `apps/mobile/.env` and `apps/backend/.env` at `../../.env` as relative symlinks,
  replacing a stale link or a real file, and exiting quietly when the root `.env`
  does not exist.
- `.env` (root, git-ignored): moved from `apps/mobile/.env`; the shared template
  now lives at the repository root. `.env.example` moves from `apps/mobile` to the
  repository root for the same reason.
- `apps/mobile/package.json`: rename `robin-talks` to `@robin-talks/mobile`; scripts
  unchanged (`start`, `lint`, `typecheck`, `test`).
- `apps/backend/package.json`: rename `hono` to `@robin-talks/backend`; add
  `typecheck` (`tsc --noEmit`), `build` (`tsc`), and `test` is omitted (no tests).
- `apps/backend/pnpm-workspace.yaml` (deleted): leftover pnpm build-approval config
  that conflicts with Bun workspaces.
- `bun.lock` (new, repo root), `apps/mobile/bun.lock` and `apps/backend/bun.lock`
  (deleted): one root lockfile for the whole workspace.
- `.gitignore`: ignore the `.turbo/` cache directory. `.env` and `.env.local` are
  already covered and need no change.
- Docs (Phase 4): `CLAUDE.md`/`AGENTS.md`, `docs/agent-docs/workflows.md`,
  `docs/agent-docs/directory-map.md`, `README.md`.

## Data Model and Contracts
No data model change. The workspace contract that consumers see:

- Root scripts are the only supported entry point for cross-workspace work:
  `bun run build`, `bun run dev`, `bun run lint`, `bun run typecheck`,
  `bun run test`. They map 1:1 to `turbo run <task>`.
- Root `dev` runs `turbo run start` because the Expo app names its dev task `start`;
  no duplicate `dev` script is added to the mobile manifest.
- Turborepo is a strict no-op for a task a workspace does not declare: `build`
  runs for `apps/backend` only, and `lint`/`typecheck`/`test` run wherever declared.
- Package filter syntax stays Turborepo's, e.g. `bunx turbo run test
  --filter=@robin-talks/mobile`.

## Shared Environment Contract
The root `.env` is the only env file a developer edits; workspaces never hold a
real `.env` of their own.

- `apps/mobile/.env` and `apps/backend/.env` are relative symlinks to `../../.env`,
  created by `bun run env:link` and refreshed automatically because the `start`
  task depends on the root task `//#env:link`.
- Both symlinks and the root `.env` are git-ignored, so no secret is ever staged.
- Expo keeps working unchanged: it resolves `.env` with standard dotenv rules from
  the project root (`apps/mobile`) and inlines `EXPO_PUBLIC_*` values, and it also
  honors variables already present in `process.env`.
- Bun keeps working unchanged: it auto-loads `.env` from the current working
  directory, and the symlink resolves to the root file.
- EAS remote builds upload the app directory only, so a root `.env` never reaches
  them. `EXPO_PUBLIC_*` values for EAS come from EAS environment variables
  (`eas env:pull` for local parity); this path is unaffected by the change.

## Libraries
- `turbo@^2.11.7` (root devDependency): task graph runner and cache; reads
  `turbo.json`, resolves the workspace graph from the root `package.json`
  `workspaces` field, and detects the package manager from the root `bun.lock`.
- `bun@1.4.2` (already installed): workspace-aware installer producing the single
  root `bun.lock`; replaces the per-package lockfiles.
- `typescript@~6.0.3` (`apps/mobile`) and `typescript@^7.0.2` (`apps/backend`):
  unchanged; each workspace typechecks with its own compiler version.

## Risks
- Bun hoists dependencies to a root `node_modules`, so Metro and Jest now resolve
  packages one level higher than before: mitigated by running the mobile
  `lint`, `typecheck`, and full `test` suite from `apps/mobile` after the root
  install, plus `turbo run test` from the root.
- Removing the per-package lockfiles discards their resolved trees: mitigated by
  letting `bun install` regenerate everything from the manifests and confirming the
  mobile suite still reports 5 suites / 56 tests.
- Duplicate workspace package names break Bun's workspace install: mitigated by
  giving the root, mobile, and backend manifests three distinct scoped names
  before installing.
- `typescript@7` in `apps/backend` emits on `tsc` while `apps/mobile` only runs
  `--noEmit`: mitigated by keeping `build` scoped to `apps/backend` and declaring
  `dist/**` as its Turborepo output, with `dist/` already git-ignored.
- A hard `packageManager` pin blocks installs on machines running a different Bun
  patch: accepted deliberately, and the pin is bumped in one place if it bites.
- A relative symlink is the sharing mechanism, so Windows needs Developer Mode or
  elevation to create it, and a plain `bun run start` inside a workspace bypasses
  `//#env:link`: mitigated by making the link script idempotent, printing the path
  it linked, and documenting that the root `bun run dev` is the supported entry
  point. The alternative, `bun --env-file=../../.env` in each workspace script, was
  rejected because Bun resolves explicit env files against the cwd too and errors
  when the file is missing, which would break EAS-side and CI runs.
- Moving `.env` to the root silently drops it for anyone whose editor or tooling
  only looks inside `apps/mobile`: mitigated by keeping the root `.env.example`
  and calling the move out in the docs and README.