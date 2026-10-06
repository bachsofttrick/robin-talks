# Directory Map

Source paths are relative to `apps/mobile/` unless noted. The agent docs live at
the repository root under `docs/agent-docs/`.

Annotated tree of tracked source. Generated output (`dist/`, `.expo/`,
`node_modules/`) is omitted.

```
robin-talks/
├── package.json               Private root, "robin-talks-monorepo": workspaces ["apps/*"],
│   │                          packageManager bun@1.4.2, turbo + typescript devDeps, five
│   │                          turbo scripts (build, dev, lint, typecheck, test) plus env:link.
├── turbo.json                 Task graph: build, typecheck, lint, test, start, //#env:link;
│   │                          agentGuidance false keeps AGENTS.md a symlink.
├── bunfig.toml                [install] linker = "hoisted" (required by the mobile Jest
│   │                          transformIgnorePatterns allow-list).
├── bun.lock                   The single lockfile for both workspaces.
├── scripts/
│   │   └── link-env.mjs       bun run env:link; points each workspace .env symlink at ../../.env.
├── .env / .env.example        The only real env files (git-ignored .env). EAS gets its
│   │                          EXPO_PUBLIC_* values from EAS environment variables.
├── AGENTS.md                  Symlink to CLAUDE.md. Keep it a symlink.
├── apps/
│   ├── mobile/                The Expo React Native app, package @robin-talks/mobile
│   │   │                      (was the repo root before the move).
│   │   ├── .env               Symlink to ../../.env, maintained by env:link.
│   │   ├── expo-entry.js      Entry. Imports the three polyfills, wraps the app in
│   │   │                      SafeAreaProvider, registerRootComponent.
│   │   ├── src/
│   │   │   ├── index.tsx      Borel-managed app root: nests ErrorHandler, StatusBar,
│   │   │   │                  AppFonts, CoreProviders, NavigationContainer, RootNavigator.
│   │   │   ├── navigation/
│   │   │   │   ├── index.tsx  Barrel for the navigation module.
│   │   │   │   ├── NavigationContainer.tsx  React Navigation theme built from the app colours.
│   │   │   │   └── RootNavigator.tsx  Native stack (signed-out Practice, Splash, Onboarding vs Tabs) and the bottom tab navigator.
│   │   │   ├── screens/
│   │   │   │   ├── index.tsx  Barrel exporting the four screens.
│   │   │   │   ├── Onboarding/index.tsx  Name + level form; saves the learner profile.
│   │   │   │   ├── Practice/index.tsx    Scenario catalog, suggested scene, resume card.
│   │   │   │   ├── Session/index.tsx     The voice/text conversation and the debrief view.
│   │   │   │   └── Settings/index.tsx    Profile edit, data deletion, account panel, legal links.
│   │   │   └── lib/
│   │   │       ├── api/               Domain hooks and static data (see api-layer.md).
│   │   │       │   ├── index.tsx      Barrel.
│   │   │       │   ├── scenarios.ts   8 built-in scenarios and the Level type.
│   │   │       │   ├── useProfile.tsx  Learner name/level; module-scope persisted store.
│   │   │       │   ├── useSessions.tsx Open session, create, fetchOne, saveTranscript, finish, recent, clearAll.
│   │   │       │   ├── useMemory.tsx   Robin memory notes: data, remember, clearAll.
│   │   │       │   └── useRobin.tsx    nextTurn and debrief, with the persona system prompt.
│   │   │       ├── core/              Borel backend kit.
│   │   │       │   ├── index.tsx      CoreProviders -> AuthProvider.
│   │   │       │   ├── db.ts          Connector: re-exports db/* and assembles the `db` object.
│   │   │       │   ├── auth.tsx       Connector: re-exports auth/* public surface.
│   │   │       │   ├── legal.tsx      Borel-managed LegalLinks component and URLs.
│   │   │       │   ├── borel/
│   │   │       │   │   ├── borel-store.js     Vendor reactive store (createStore, usePersistedState, ...).
│   │   │       │   │   └── borel-systemui.js  Vendor native-module bridge (permissions, recording, speech, ...).
│   │   │       │   ├── db/
│   │   │       │   │   ├── config.ts     EXPO_PUBLIC_* reads, IN_BROWSER, SURFACE, borelHeaders.
│   │   │       │   │   ├── errors.ts     Neutral error sentences, plainError, looksPlain, refusals.
│   │   │       │   │   ├── consent.ts    AI consent prompts and AI_AUDIO_MODEL.
│   │   │       │   │   ├── auth.ts       neon-js client, broker session (web), cookie session (native), tellScreens, sessionCookieHeader.
│   │   │       │   │   ├── data.ts       Native backend data client for /api/data/*: profile, sessions, memory, profiles.
│   │   │       │   │   ├── storage.ts    File upload/presign and account deletion.
│   │   │       │   │   ├── ai.ts         OpenRouter chat/transcribe (AiJsonSchema structured output) + Borel image/editImage.
│   │   │       │   │   ├── moderation.ts Report/block/check content; re-exports forgetModeration.
│   │   │       │   │   ├── moderation-state.ts  Reported/blocked cache, imported by db/auth.ts.
│   │   │       │   │   └── notify.ts     borelFetch, push notify, device linking.
│   │   │       │   └── auth/
│   │   │       │       ├── types.ts      User, Session, AuthResult.
│   │   │       │       ├── constants.ts  Labels/URLs, KIT colours.
│   │   │       │       ├── errors.ts     authErrorMessage and error helpers.
│   │   │       │       ├── actions.ts    signUp/signIn/signOut/reset/deleteAccount/syncProfile.
│   │   │       │       ├── context.tsx   AuthProvider, useAuth, useKitSession.
│   │   │       │       ├── labels.ts     AccountKitLabels and LABELS.
│   │   │       │       ├── controls.tsx  Field, PrimaryButton, LinkButton, Problem, Note.
│   │   │       │       ├── SignInFlow.tsx   Multi-step sign in / sign up / confirm / reset.
│   │   │       │       ├── SignInSheet.tsx  SignInFlow in a modal.
│   │   │       │       ├── RequireAccount.tsx  Signed-out bird + sign-in card gate.
│   │   │       │       └── AccountPanel.tsx    Signed-in account screen.
│   │   │       ├── ui/                Shared visual kit (see ui-kit.md).
│   │   │       │   ├── index.tsx      Barrel for all components.
│   │   │       │   ├── theme.ts       colours, spacing, radius, fonts, type, elevation, brand, components.
│   │   │       │   ├── fonts.tsx      Borel-managed font loader (Lora, Manrope).
│   │   │       │   ├── Screen.tsx     Safe-area + gutter + keyboard wrapper.
│   │   │       │   ├── Button.tsx     primary / outline / quiet.
│   │   │       │   ├── Field.tsx      Labelled text input.
│   │   │       │   ├── Notice.tsx     Inline error row with Details and retry.
│   │   │       │   ├── EmptyState.tsx Empty placeholder with an action.
│   │   │       │   ├── SectionHeader.tsx  Title + optional count.
│   │   │       │   ├── TabBar.tsx     useTabBarOptions height/inset helper.
│   │   │       │   ├── Bird.tsx       The Robin bird SVG mark.
│   │   │       │   ├── Texture.tsx    Paper grain overlay.
│   │   │       │   ├── motion.ts      useEnter, useStagger, usePress.
│   │   │       │   └── ErrorHandler/index.tsx  Render error boundary.
│   │   │       └── polyfills/
│   │   │           ├── cryptoPolyfill.ts    crypto.randomUUID for Hermes.
│   │   │           ├── responsePolyfill.ts  Response.json static.
│   │   │           └── alertPolyfill.ts     DOM Alert for react-native-web.
│   │   ├── assets/            icon.png, splash-icon.png, favicon.png.
│   │   ├── app.json           Expo config (name, slug, plugins, identifiers).
│   │   ├── package.json       @robin-talks/mobile: start/android/ios/web/typecheck/
│   │   │                      lint/test scripts, deps, and the Jest config block.
│   │   ├── babel.config.js    babel-preset-expo.
│   │   ├── tsconfig.json      Extends expo/tsconfig.base, strict, jest types.
│   │   ├── eslint.config.mjs  eslint-config-expo flat config with ignores.
│   │   └── LICENSE
│   └── backend/               Hono service, package @robin-talks/backend; runs better-auth at
│       │                      /api/auth/* and the app data API at /api/data/* over drizzle +
│       │                      Neon Postgres. The native app talks to it over HTTP.
│           ├── .env           Symlink to ../../.env, maintained by env:link.
│           ├── drizzle.config.ts  drizzle-kit config (Postgres, schema ./src/db/schema.ts, out ./drizzle).
│           ├── drizzle/       Committed migrations 0000_lean_george_stacy.sql (auth) and
│           │                  0001_complete_silver_fox.sql (app tables), plus meta/ snapshots.
│           ├── src/
│           │   ├── index.ts   Entry: default-exports app; under import.meta.main calls requireDatabaseUrl() then Bun.serve.
│           │   ├── app.ts     createApp(): GET /health, CORS on /api/auth/*, app.all("/api/auth/*", auth.handler), app.route("/api/data", dataRouter).
│           │   ├── auth.ts    betterAuth 1.6.23 + drizzle adapter + emailOTP plugin, session freshAge 0.
│           │   ├── env.ts     process.env readers: database URLs, auth base URL/secret, trusted origins, mail, port.
│           │   ├── db/        client.ts (lazy memoized pg Pool + drizzle), schema.ts (four auth + four app tables), index.ts barrel.
│           │   ├── data/      router.ts: authenticated /api/data/* CRUD (profile, sessions, memory, profiles); router.test.ts.
│           │   └── mail/      otp-transport.ts: dev outbox vs fetch provider transport.
│           ├── package.json   Private, type module: dev/typecheck/lint/test/build + db:generate/db:migrate/db:verify.
│           ├── eslint.config.mjs  @eslint/js + typescript-eslint flat config; ignores dist.
│           ├── tsconfig.json  ESNext/NodeNext, strict, jsxImportSource hono/jsx, bun-types.
│           └── tsconfig.build.json  Extends the base; rootDir src, outDir dist, excludes *.test.ts.
├── docs/agent-docs/           This knowledge base plus specs/ and plans/.
├── README.md                  The monorepo README (app overview, run, scripts, backend).
├── CLAUDE.md                  Root orientation doc (AGENTS.md symlinks to it).
└── .gitignore                 Ignores node_modules, .expo, dist, .turbo, .env, playwright dirs.
```

`apps/backend/src/**/*.test.ts` holds the `bun:test` suites next to source (app,
auth e2e, conformance, data, db, env, mail); the database-backed ones
(`auth.e2e.test.ts`, `data/router.test.ts`, `db/migration.test.ts`) skip with a
reported reason when no database is configured.

Both workspaces have a `node_modules` holding only `typescript` (`~6.0.3` in
mobile, `7.0.2` in backend); every other dependency is hoisted to the root
`node_modules`. There is no per-workspace lockfile.
