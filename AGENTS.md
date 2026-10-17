# Robin Talks

A voice-first English speaking practice app in a Bun/Turborepo monorepo. The
`apps/mobile` Expo client uses `apps/backend`, a Hono service, for account,
learner-data, and AI APIs.

## Working in this repository

- Read the relevant page in `docs/agent-docs/` before changing a subsystem. Start
  with [architecture.md](docs/agent-docs/architecture.md) for the system flow,
  [directory-map.md](docs/agent-docs/directory-map.md) for file locations,
  [conventions.md](docs/agent-docs/conventions.md) for coding rules, and
  [workflows.md](docs/agent-docs/workflows.md) for install, commands, and builds.
- Do not hand-edit Borel-managed files or vendor bridges. The exact paths and
  app-owned alternatives are listed in [conventions.md](docs/agent-docs/conventions.md).
- Edit the root `.env` only. Workspace `.env` files are symlinks to `../../.env`;
  use `bun run env:link` to restore them.
- Keep `bunfig.toml`'s hoisted linker and `turbo.json`'s `agentGuidance: false`.
- Never store raw audio or commit secrets. Only transcripts and debriefs are
  persisted; backend credentials stay in environment variables.

## Agent docs index

- [architecture.md](docs/agent-docs/architecture.md) - system layers and practice-session flow
- [directory-map.md](docs/agent-docs/directory-map.md) - annotated repository tree
- [screens-and-navigation.md](docs/agent-docs/screens-and-navigation.md) - screen and navigation flows
- [api-layer.md](docs/agent-docs/api-layer.md) - domain hooks, scenarios, and data tables
- [backend-and-ai.md](docs/agent-docs/backend-and-ai.md) - backend, data/auth clients, and AI transport
- [auth.md](docs/agent-docs/auth.md) - authentication provider and account UI
- [ui-kit.md](docs/agent-docs/ui-kit.md) - shared components and theme
- [conventions.md](docs/agent-docs/conventions.md) - code patterns and constraints
- [workflows.md](docs/agent-docs/workflows.md) - install, run, test, lint, typecheck, and build commands

Feature specs, implementation plans, and reports live under
`docs/agent-docs/{specs,plans,reports}/`.

<!-- docs-baseline: 96e284e74a287212df5c7e26fd53f212337c075b -->
