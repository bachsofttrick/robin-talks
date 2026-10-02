# Directory Map

Annotated tree of tracked source. Generated output (`dist/`, `.expo/`,
`node_modules/`) is omitted.

```
robin-talks/
├── expo-entry.js              Entry. Imports the three polyfills, wraps the app in
│                              SafeAreaProvider, registerRootComponent.
├── src/
│   ├── index.tsx              Borel-managed app root: nests ErrorHandler, StatusBar,
│   │                          AppFonts, CoreProviders, NavigationContainer, RootNavigator.
│   ├── navigation/
│   │   ├── index.tsx          Barrel for the navigation module.
│   │   ├── NavigationContainer.tsx  React Navigation theme built from the app colours.
│   │   └── RootNavigator.tsx  Native stack (Onboarding vs Tabs) and the bottom tab navigator.
│   ├── screens/
│   │   ├── index.tsx          Barrel exporting the four screens.
│   │   ├── Onboarding/index.tsx  Name + level form; saves the learner profile.
│   │   ├── Practice/index.tsx    Scenario catalog, suggested scene, resume card.
│   │   ├── Session/index.tsx     The voice/text conversation and the debrief view.
│   │   └── Settings/index.tsx    Profile edit, data deletion, account panel, legal links.
│   └── lib/
│       ├── api/               Domain hooks and static data (see api-layer.md).
│       │   ├── index.tsx      Barrel.
│       │   ├── scenarios.ts   8 built-in scenarios and the Level type.
│       │   ├── useProfile.tsx  Learner name/level; module-scope persisted store.
│       │   ├── useSessions.tsx Open session, create, fetchOne, saveTranscript, finish, recent, clearAll.
│       │   ├── useMemory.tsx   Robin memory notes: data, remember, clearAll.
│       │   └── useRobin.tsx    nextTurn and debrief, with the persona system prompt.
│       ├── core/              Borel backend kit.
│       │   ├── index.tsx      CoreProviders -> AuthProvider.
│       │   ├── db.ts          Connector: re-exports db/* and assembles the `db` object.
│       │   ├── auth.tsx       Connector: re-exports auth/* public surface.
│       │   ├── legal.tsx      Borel-managed LegalLinks component and URLs.
│       │   ├── db/
│       │   │   ├── config.ts     EXPO_PUBLIC_* reads, IN_BROWSER, SURFACE, borelHeaders.
│       │   │   ├── errors.ts     Neutral error sentences, plainError, looksPlain, refusals.
│       │   │   ├── consent.ts    AI consent prompts and AI_AUDIO_MODEL.
│       │   │   ├── auth.ts       neon-js client, broker session (web), cookie session (native), tellScreens.
│       │   │   ├── storage.ts    File upload/presign and account deletion.
│       │   │   ├── ai.ts         OpenRouter chat/transcribe + Borel image/editImage.
│       │   │   ├── moderation.ts Report/block/check content.
│       │   │   ├── moderation-state.ts  Report/block cache, shared with auth.
│       │   │   └── notify.ts     borelFetch, push notify, device linking.
│       │   └── auth/
│       │       ├── types.ts      User, Session, AuthResult.
│       │       ├── constants.ts  Labels/URLs, APPLE_SIGN_IN_AVAILABLE, KIT colours.
│       │       ├── errors.ts     authErrorMessage and error helpers.
│       │       ├── actions.ts    signUp/signIn/signOut/reset/Apple/deleteAccount/syncProfile.
│       │       ├── context.tsx   AuthProvider, useAuth, useKitSession.
│       │       ├── labels.ts     AccountKitLabels and LABELS.
│       │       ├── controls.tsx  Field, PrimaryButton, LinkButton, AppleButton, Problem, Note.
│       │       ├── SignInFlow.tsx   Multi-step sign in / sign up / confirm / reset.
│       │       ├── SignInSheet.tsx  SignInFlow in a modal.
│       │       ├── RequireAccount.tsx  Signed-out card gate.
│       │       └── AccountPanel.tsx    Signed-in account screen.
│       ├── ui/                Shared visual kit (see ui-kit.md).
│       │   ├── index.tsx      Barrel for all components.
│       │   ├── theme.ts       colours, spacing, radius, fonts, type, elevation, brand, components.
│       │   ├── fonts.tsx      Borel-managed font loader (Lora, Manrope).
│       │   ├── Screen.tsx     Safe-area + gutter + keyboard wrapper.
│       │   ├── Button.tsx     primary / outline / quiet.
│       │   ├── Field.tsx      Labelled text input.
│       │   ├── Notice.tsx     Inline error row with Details and retry.
│       │   ├── EmptyState.tsx Empty placeholder with an action.
│       │   ├── SectionHeader.tsx  Title + optional count.
│       │   ├── TabBar.tsx     useTabBarOptions height/inset helper.
│       │   ├── Bird.tsx       The Robin bird SVG mark.
│       │   ├── Texture.tsx    Paper grain overlay.
│       │   ├── motion.ts      useEnter, useStagger, usePress.
│       │   └── ErrorHandler/index.tsx  Render error boundary.
│       └── polyfills/
│           ├── cryptoPolyfill.ts    crypto.randomUUID for Hermes.
│           ├── responsePolyfill.ts  Response.json static.
│           └── alertPolyfill.ts     DOM Alert for react-native-web.
├── borel-store.js             Vendor reactive store (createStore, usePersistedState, ...).
├── borel-systemui.js          Vendor native-module bridge (permissions, recording, speech, ...).
├── assets/                    icon.png, splash-icon.png, favicon.png.
├── docs/agent-docs/           This knowledge base plus specs/ and plans/.
├── openspec/                  OpenSpec config, synced specs, archived changes.
├── app.json                   Expo config (name, slug, plugins, identifiers).
├── package.json               Scripts, deps, and the Jest config block.
├── babel.config.js            babel-preset-expo.
├── tsconfig.json              Extends expo/tsconfig.base, strict, jest types.
├── eslint.config.mjs          eslint-config-expo flat config with ignores.
└── .env / .env.example        EXPO_PUBLIC_* configuration (see workflows.md).
```
