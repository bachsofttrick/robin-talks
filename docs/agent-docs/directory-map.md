# Directory Map

Annotated tree of the repository, excluding `node_modules/`. Source files live under `src/`; root-level files like `index.tsx`, `borel-store.js`, `borel-systemui.js`, and `expo-entry.js` stay at the project root.

```
/app
├── expo-entry.js          Registers the root component and wraps it in SafeAreaProvider
├── index.tsx              App root: ErrorHandler > StatusBar > AppFonts > CoreProviders > NavigationContainer > RootNavigator
├── app.json               Expo config: name, slug, icons, iOS/Android identifiers, plugins
├── package.json           Scripts, dependencies, devDependencies; "main" is expo-entry.js
├── tsconfig.json          Extends expo/tsconfig.base, strict: true
├── babel.config.js        Single preset: babel-preset-expo
├── bun.lock               Bun lockfile
├── .gitignore             node_modules, .expo, dist, web-build, logs, /ios, /android, .env files
├── README.md              Export notes, run instructions, Borel module descriptions, store-publishing checklist
├── borel-store.js         876-line dependency-free reactive store (createStore + helpers)
├── borel-systemui.js      1700+ line bridge over Expo native modules
│
├── src/
│   ├── lib/
│   │   ├── api/               Domain hooks, pure helpers, and the scenario catalog
│   │   │   ├── index.tsx      Barrel: re-exports hooks, SCENARIOS, and types
│   │   │   ├── scenarios.ts   Level type and the 8-entry SCENARIOS catalog + scenarioById()
│   │   │   ├── store.ts       Typed createAppStore wrapper over borel-store createStore
│   │   │   ├── store.test.ts  Unit tests for the store wrapper
│   │   │   ├── useProfile.tsx learner_profiles table + account-scoped "robin.profile" store + legacy import
│   │   │   ├── profileImport.ts  parseLegacyProfile: one-time borel-store:robin.profile import
│   │   │   ├── useSessions.tsx  practice_sessions table + shared "robin.openSession" store: open/create/save/finish/recent/clearAll
│   │   │   ├── useMemory.tsx  robin_memory table + shared "robin.memory" store: list/insert/clearAll
│   │   │   ├── robinPrompt.ts  buildSystemPrompt: system prompt plus JSON tool protocol
│   │   │   ├── robinTools.ts  runSessionTool: search_sessions/get_session/list_recent_sessions over a SessionReader port
│   │   │   ├── robinAgent.ts  runRobinTurn tool loop (3 rounds) plus parseDebrief
│   │   │   ├── sessionReader.ts  Live SessionReader: user-scoped ended practice_sessions reads
│   │   │   ├── useRobin.tsx   Stateless wiring: nextTurn via prompt/agent/reader, debrief via smart model
│   │   │   ├── profileImport.test.ts, robinPrompt.test.ts, robinTools.test.ts, robinAgent.test.ts, scenarios.test.ts
│   │   │
│   │   ├── core/              Borel-managed backend surface (regenerated)
│   │   │   ├── index.tsx      CoreProviders (AuthProvider only)
│   │   │   ├── db.ts          28-line barrel: re-exports from `db/` submodules
│   │   │   ├── db/
│   │   │   │   ├── config.ts       Borel URLs, surface detection, borelHeaders
│   │   │   │   ├── errors.ts       AiRefusal, plainError, refusalOf, noteRefusal
│   │   │   │   ├── consent.ts      AI consent (askAiConsent)
│   │   │   │   ├── auth.ts         User, brokerAuth, session cookies, client, authHeader
│   │   │   │   ├── storage.ts      storage, account, upload helpers
│   │   │   │   ├── ai.ts           ai (chat/transcribe/image/editImage), media encoding
│   │   │   │   ├── moderation.ts   moderation (report/block/filter/check)
│   │   │   │   └── notify.ts       notify, push device linking, borelFetch
│   │   │   ├── auth.tsx       31-line connector: re-exports from `auth/` submodules
│   │   │   ├── auth/
│   │   │   │   ├── types.ts        User, Session, AuthResult
│   │   │   │   ├── constants.ts    Auth URLs, availability flags, IN_PREVIEW, KIT palette, APPLE_LOGO_PATH
│   │   │   │   ├── errors.ts       SUCCESS, failed, authErrorMessage, displayNameFor, madeWithoutSession
│   │   │   │   ├── actions.ts      signUp/signIn/signOut, password and email flows, deleteAccount, signInWithApple, syncProfile
│   │   │   │   ├── context.tsx     AuthState, AuthContextValue, AuthProvider, useAuth, useKitSession
│   │   │   │   ├── labels.ts       AccountKitLabels, LABELS, labelsWith
│   │   │   │   ├── controls.tsx    Field, PrimaryButton, LinkButton, AppleButton, Problem, Note
│   │   │   │   ├── SignInFlow.tsx  SignInStep, SignInFlow (sign in / sign up / confirm / forgot / reset)
│   │   │   │   ├── SignInSheet.tsx SignInFlow in a modal sheet
│   │   │   │   ├── RequireAccount.tsx  Sign-in card in front of account-only content
│   │   │   │   ├── AccountPanel.tsx    Signed-in account screen: change password, sign out, delete account
│   │   │   │   └── errors.test.ts, labels.test.ts
│   │   │   └── legal.tsx      LEGAL_LINKS, openPrivacyPolicy, openTermsOfUse, LegalLinks
│   │   │
│   │   ├── ui/                Design system
│   │   │   ├── index.tsx      Barrel for all components, tokens, and hooks
│   │   │   ├── theme.ts       colors, spacing, radius, fonts, type, components, elevation, brand, iconStroke
│   │   │   ├── fonts.tsx      AppFonts: loads Lora/Manrope (Borel-regenerated)
│   │   │   ├── motion.ts      useEnter, useStagger, usePress
│   │   │   ├── Screen.tsx     Safe-area + gutter + keyboard wrapper with scroll option
│   │   │   ├── Button.tsx     primary / outline / quiet variants
│   │   │   ├── Field.tsx      Labelled TextInput
│   │   │   ├── Notice.tsx     Inline error/notice row with optional Details and retry
│   │   │   ├── EmptyState.tsx Icon well + title + message + action
│   │   │   ├── SectionHeader.tsx  Section title with optional count
│   │   │   ├── TabBar.tsx     useTabBarOptions: device-aware tab bar dimensions
│   │   │   ├── Texture.tsx    Paper: SVG grain overlay
│   │   │   ├── Bird.tsx       Robin bird SVG mark
│   │   │   └── ErrorHandler/index.tsx  React error boundary
│   │   │
│   │   └── polyfills/          Polyfill modules
│   │
│   ├── navigation/            React Navigation wiring
│   │   ├── index.tsx          Barrel for the three modules below
│   │   ├── NavigationContainer.tsx  navigationTheme built from DefaultTheme + app colours
│   │   ├── RootNavigator.tsx  Loading / profile-error retry / Onboarding / Tabs with open-session initial tab
│   │   └── rootRoute.ts       Pure root routing decision + rootRoute.test.ts
│   │
│   └── screens/               The four screens
│       ├── index.tsx          Barrel: Onboarding, Practice, Session, Settings
│       ├── Onboarding/index.tsx  Name + level form, saves the profile
│       ├── Practice/index.tsx    Scenario catalog with a suggested scene and a resume card
│       ├── Session/index.tsx     Voice/typing practice loop and debrief rendering
│       ├── Session/useTurnRecorder.ts  Recording wrapper: 150 ms metering poll, pause end, manual stop
│       ├── Session/voiceActivity.ts (+ .test.ts)  Pure pause detector: nextVoiceActivity state machine
│       └── Settings/index.tsx    Profile edit, data deletion, AccountPanel, LegalLinks
│
├── assets/                icon.png, splash-icon.png, favicon.png
│
└── docs/
    └── agent-docs/
        ├── *.md           These documentation pages
        └── specs/260919-robin-english-practice/   spec.md, plan.md, tasks.md, result-from-borel-build.md
```

## Notes

- `bun.lock` and `node_modules/` are present but `node_modules` is gitignored (`/app/.gitignore:1`).
- `docs/agent-docs/specs/260919-robin-english-practice/` is the sdd working artifact set; its tasks remain unchecked (`docs/agent-docs/specs/260919-robin-english-practice/tasks.md:9-77`).
- There is no `app/` (Expo Router), `server/`, or `tests/` directory.
