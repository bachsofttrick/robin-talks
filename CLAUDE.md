# Robin Talks

A voice-first Expo React Native app that helps non-English speakers practise English in short, realistic scenarios. The AI agent Robin plays the other person in each scene, speaks through the device, transcribes the learner's spoken replies, coaching mistakes inline, and writes an end-of-session debrief. Accounts, per-user memory, sessions, and AI calls are backed by the Borel cloud (`api.borel.one`). The project was exported from Borel and is a plain Expo project that does not depend on Borel tooling at runtime.

## Tech Stack
- TypeScript ~5.9.2 (`strict: true`), targeting Expo SDK ~57.0.0
- React 19.2.3 and React Native 0.86.3
- Expo modules: expo-audio, expo-speech, expo-font, expo-constants, expo-apple-authentication, expo-iap, expo-image-picker, expo-notifications, and more (see `package.json`)
- React Navigation 7: `@react-navigation/bottom-tabs`, `@react-navigation/native`, `@react-navigation/native-stack`
- `@neondatabase/neon-js` `^0.7.0-beta` as the Postgres data and auth client
- `react-native-svg`, `lucide-react-native`, `@expo-google-fonts/lora`, `@expo-google-fonts/manrope`
- `bun.lock` is present and `README.md` documents `bun install` as the install path
- Test runner is Jest with the `jest-expo` preset (`jest-expo`, `jest`, `@types/jest` in devDependencies)
- Lint is ESLint 9 with the `eslint-config-expo` flat config (`eslint`, `eslint-config-expo` in devDependencies; config in `eslint.config.mjs`; run with `bun run lint`)

## Directory Layout
- `api/` - domain hooks and the scenario catalog: `useProfile`, `useSessions`, `useMemory`, `useRobin`, `scenarios.ts`; pure helpers `store`, `profileImport`, `robinPrompt`, `robinTools`, `robinAgent`, `sessionReader`, each with a colocated `*.test.ts`
- `core/` - Borel-managed backend surface: `db.ts` (client, AI, storage, moderation), `auth.tsx` (session + account UI), `legal.tsx`
- `navigation/` - React Navigation container, theme, root stack/tab navigator, and the pure `rootRoute` routing decision
- `screens/` - the four screens: `Onboarding`, `Practice`, `Session` (plus `useTurnRecorder` and the pure `voiceActivity` pause detector), `Settings`
- `ui/` - reusable design system: theme tokens, fonts, motion, and presentational components
- `borel-store.js` - dependency-free persistent state store (`createStore`)
- `borel-systemui.js` - native capability bridge (recording, TTS, permissions, IAP, notifications, sharing)
- `assets/` - app icon, splash, favicon
- `docs/agent-docs/specs/` - spec-driven-development artifacts (not documentation pages)

## Key Commands
- Install: `bun install`
- Run: `bunx expo start` (or `bun start`; `bun run ios`, `bun run android`, `bun run web`)
- Typecheck: `bun run typecheck` (`tsc --noEmit`)
- Lint: `bun run lint` (`eslint .` with `eslint-config-expo` flat config)
- Test: `bun run test` (`jest` with the `jest-expo` preset)

There is no CI configuration in this repository.

## Conventions
- Source lives at the project root, not under `src/`; imports are relative (`./`, `../`).
- `core/db.ts`, `core/auth.tsx`, and `core/legal.tsx` are marked "Managed by Borel" and are regenerated. Put app logic elsewhere.
- `index.tsx` and `ui/fonts.tsx` are also Borel-regenerated; a file that starts with `// borel: custom entry` is left alone by Borel.
- All visual values come from `ui/theme.ts` tokens (`colors`, `spacing`, `radius`, `fonts`, `type`, `components`). Screens spread tokens rather than restating styles.
- Hooks return data plus `loading`/`error`; failed database calls show `plainError(res.error, "load" | "save")` from `core/db.ts`.
- All user-facing error strings are one plain, non-technical sentence with a leading capital and terminal punctuation. Technical detail goes in a separate `detail` field.
- Components are one-per-file, PascalCase filenames (`Button.tsx`); hooks and modules are camelCase (`useProfile.tsx`, `scenarios.ts`).
- Each feature directory (`screens/Session/`, `ui/ErrorHandler/`) has an `index.tsx` entry.
- Unit tests live beside the module as `*.test.ts` and run with `bun run test`.
- Pure testable modules never import the runtime `core/db`; they use `import type` and receive data or callbacks from callers.

## Agent Docs Index
- [architecture.md](docs/agent-docs/architecture.md) - components, providers, session lifecycle, and how data flows
- [directory-map.md](docs/agent-docs/directory-map.md) - annotated tree of every significant directory and file
- [backend-and-ai.md](docs/agent-docs/backend-and-ai.md) - Borel cloud client, database tables, auth, AI, storage, moderation
- [ui-and-navigation.md](docs/agent-docs/ui-and-navigation.md) - navigation structure, screens, and the UI design system
- [borel-runtime.md](docs/agent-docs/borel-runtime.md) - `borel-store.js` state store and `borel-systemui.js` native bridge
- [conventions.md](docs/agent-docs/conventions.md) - code style and patterns observed in the source
- [workflows.md](docs/agent-docs/workflows.md) - install, run, typecheck, test, and build steps

## Specs and Plans
- Feature specs (sdd workflow): `docs/agent-docs/specs/<YYMMDD>-<slug>/`
