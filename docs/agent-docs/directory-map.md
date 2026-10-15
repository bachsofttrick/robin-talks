# Directory Map

Source paths are relative to `apps/mobile/` unless noted. The agent docs live at
the repository root under `docs/agent-docs/`.

Annotated tree of tracked source. Generated output (`dist/`, `.expo/`,
`node_modules/`) is omitted.

```
robin-talks/
├── package.json               Private root, "robin-talks-monorepo": workspaces ["apps/*"],
│   │                          packageManager bun@1.4.2, turbo + typescript devDeps, six
│   │                          turbo scripts (build, dev, lint, typecheck, test, db:migrate) plus env:link.
├── turbo.json                 Task graph: build, typecheck, lint, test, dev, //#env:link;
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
│   │   │       │   ├── legal.tsx      Borel-managed LegalLinks with hardcoded Borel/Apple URLs; kept for regeneration, nothing imports it.
│   │   │       │   ├── legalLinks.tsx App-owned legal links the app uses: LEGAL_LINKS, openPrivacyPolicy/openTermsOfUse, LegalLinks; builds the backend /legal/* URLs from EXPO_PUBLIC_BACKEND_URL with its trailing /api stripped.
│   │   │       │   ├── borel/
│   │   │       │   │   ├── borel-store.js     Vendor reactive store (createStore, usePersistedState, ...).
│   │   │       │   │   └── borel-systemui.js  Vendor native-module bridge (permissions, recording, speech, ...).
│   │   │       │   ├── db/
│   │   │       │   │   ├── config.ts     EXPO_PUBLIC_BACKEND_URL only: BACKEND_AUTH_URL, BACKEND_DATA_URL,
│   │   │       │   │   │                 BACKEND_AI_URL, IN_BROWSER, SURFACE, BUILD_STAMP, borelHeaders.
│   │   │       │   │   │                 (The Borel URL consts were removed.)
│   │   │       │   │   ├── errors.ts     Neutral error sentences, plainError, looksPlain, refusals.
│   │   │       │   │   ├── consent.ts    AI consent prompts and AI_AUDIO_MODEL.
│   │   │       │   │   ├── auth.ts       neon-js client, cookie session (native), tellScreens, sessionCookieHeader; re-exports brokerAuth.
│   │   │       │   │   ├── browser-auth.ts  Browser wrapper over the backend neon-js client: own onAuthStateChange, getBetterAuthInstance.
│   │   │       │   │   ├── data.ts       Backend data client for /api/data/* on both surfaces: profile, sessions, memory, profiles.
│   │   │       │   │   ├── storage.ts    File upload/presign and account deletion; posts to the literal
│   │   │       │   │   │                 'BOREL_STORAGE'/'BOREL_ACCOUNT' placeholders.
│   │   │       │   │   ├── ai.ts         Thin client over the backend's /api/ai router: consent, device-file normalization, image dedupe, metering.
│   │   │       │   │   ├── moderation.ts Report/block/check content; re-exports forgetModeration; posts to
│   │   │       │   │   │                 the literal 'BOREL_MODERATION' placeholder.
│   │   │       │   │   ├── moderation-state.ts  Reported/blocked cache, imported by db/auth.ts.
│   │   │       │   │   └── notify.ts     borelFetch, push notify, device linking; posts to the literal
│   │   │       │   │                     'BOREL_PROXY' placeholder.
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
│   │   ├── assets/            icon.png (512x512), favicon.png, and bird-viewer.html
│   │   │                      (a standalone SVG viewer used while designing the bird mark).
│   │   │                      splash-icon.png was removed.
│   │   ├── app.json           Expo config (name, slug, plugins, identifiers).
│   │   ├── package.json       @robin-talks/mobile: dev/apk/android/ios/web/typecheck/
│   │   │                      lint/test scripts, deps, and the Jest config block.
│   │   ├── eas.json           EAS build profiles: preview (android apk) and production.
│   │   ├── .easignore         Files EAS Build must not upload (mirrors .gitignore plus .codegraph/).
│   │   ├── babel.config.js    babel-preset-expo.
│   │   ├── tsconfig.json      Extends expo/tsconfig.base, strict, jest types.
│   │   ├── eslint.config.mjs  eslint-config-expo flat config with ignores.
│   │   └── LICENSE
│   └── backend/               Hono service, package @robin-talks/backend; runs better-auth at
│       │                      /api/auth/*, the app data API at /api/data/*, and the AI router at
│       │                      /api/ai over drizzle + Neon Postgres, plus public /legal/* HTML pages.
│       │                      The native app talks to it over HTTP.
│           ├── .env           Symlink to ../../.env, maintained by env:link.
│           ├── drizzle.config.ts  drizzle-kit config (Postgres credentials from PG*, out ./drizzle).
│           ├── drizzle/       Committed migration 0000_lyrical_fallen_one.sql (all eight tables: the
│           │                  four better-auth tables and the four app tables), plus meta/ snapshots.
│           ├── src/
│           │   ├── index.ts   Entry: imports app and port, default-exports { ...app, port: port(), hostname: "0.0.0.0" }.
│           │   ├── appDef.ts  createApp(): a dev-only CPU-timing middleware when NODE_ENV !== "production";
│           │   │              GET /health; app.route("/legal", legalRouter); CORS on /api/*; auth.handler;
│           │   │              app.route("/api/data", dataRouter); app.route("/api/ai", aiRouter); exports
│           │   │              createApp and the app instance.
│           │   ├── conformance.test.ts  Proves the backend serves the auth paths the mobile client issues.
│           │   ├── lib/       auth.ts (betterAuth 1.6.23 + drizzle adapter + emailOTP plugin, session freshAge 0),
│           │   │              env.ts (process.env readers: databaseUrl/auth base URL/secret, trusted
│           │   │              origins, mail, port, openRouterApiKey, borelAiUrl; databaseUrl and
│           │   │              authSecret exit the process instead of returning null or throwing),
│           │   │              db/ (client.ts lazy memoized postgres-js client + drizzle through
│           │   │              drizzle-orm/postgres-js; schema/ auth-schema.ts + schema.ts + index.ts), ai/
│           │   │              (types.ts shared shapes and the FetchSeam seam + AiSession gate type,
│           │   │              constants.ts models/timeouts/caps, functions.ts looksPlain/openRouterSays/timeout
│           │   │              fetches/JSON and image proxies, index.ts barrel), and
│           │   │              mail/otp-transport.ts (dev outbox vs Resend transport).
│           │   └── routes/    data/ (index.ts exporting the dataRouter const with the session gate; profile.ts,
│           │                  sessions.ts, memory.ts, profiles.ts), ai/ (index.ts exporting the aiRouter const
│           │                  with the session gate; chat.ts, transcribe.ts, generations.ts, edits.ts holding the
│           │                  chatRouter, transcribeRouter, generationRouter, and editRouter consts; ai.test.ts
│           │                  with 44 tests patching the provider modules via mock.module, no database or network),
│           │                  and legal/ (index.ts exporting the legalRouter const: GET /privacy-policy and
│           │                  /terms-of-service as HTML; legal-pages.ts holds the markup; legal.test.ts).
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
ai, auth e2e, conformance, data router, db, env, legal, mail); the database-backed ones
(`lib/auth.e2e.test.ts`, `routes/router.test.ts`, `lib/db/migration.test.ts`)
skip with a reported reason when no database is configured. `routes/ai/ai.test.ts`
(44 tests) patches the AI provider modules with `mock.module` and needs neither.
`routes/router.test.ts` still lives at `routes/`, not under `routes/data/`.

Both workspaces depend on TypeScript `6.0.3` (mobile `~6.0.3`, backend `^6.0.3`)
and resolve it from the root `node_modules`; there is no nested compiler. Most
other dependencies hoist to the root `node_modules` as well, though a few tool
packages (ESLint in both workspaces) install into a workspace-local
`node_modules`. There is no per-workspace lockfile.
