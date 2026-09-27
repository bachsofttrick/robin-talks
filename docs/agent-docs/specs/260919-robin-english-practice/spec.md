# Spec: Robin, an AI English practice app

Status: implemented
Request: I want to create a English practice app, not a language learner like duolingo. Its purpose is to help non-english speaking users to practice their skills in short, realistic scenarios with an AI agent.
The AI agent, let's call it, Robin, will speak to the user in those practice sessions. The user responds with their voice (text optional but not preferred). The AI will not great the user, but rather be their guidance to help them with their interaction.
Store in database: Each practice session is counted as each session normally like a chatgpt session, and can be queried later by the AI agent using tools. The AI also remember important details of the user through interaction, so each user has their own memory (or AGENTS.md as they call it). Both memory and sessions can be deleted.
A user registers through email, password.

## Overview

A React Native app for non-English speakers who already have some English and want speaking practice, not instruction. Each practice session drops the user into a short, realistic scenario (ordering coffee, asking for directions) where the AI agent Robin plays the other person in the scene and coaches the user's English along the way. Interaction is voice-first: Robin speaks through TTS with an on-screen transcript, and the user replies by voice with typing as a fallback. Sessions and per-user memory (durable personal facts plus a learning profile) are stored server-side, retrievable by Robin through tools, and removable by the user in settings.

## User Stories

- As a non-English-speaking learner, I want to register with email and password and set my level, so Robin speaks in a way I can understand.
- As a learner, I want to pick a short realistic scenario, so I can practice situations I actually encounter.
- As a learner, I want Robin to play the other person in the scene and point out my mistakes, so I get realistic practice plus coaching.
- As a learner, I want feedback at the end of every session, so I know what to improve.
- As a learner, I want Robin to remember me between sessions, so practice picks up where it left off.
- As a learner, I want to type instead of speak when I cannot use a microphone, so practice is never blocked.
- As a learner, I want to delete my session data and Robin's memory of me, so I control my data.
- As a returning user, I want an interrupted session to resume, so a dropped connection does not lose my practice.

## Acceptance Criteria

Authentication and profile

- AC-1: A new user can register with an email and password. Registration rejects an email that already has an account and a password shorter than 8 characters, showing a clear error. A registered user logs in with correct credentials; a wrong password or unknown email shows an error and grants no access.
- AC-2: After first registration the user completes onboarding: display name (non-empty) and level (Beginner, Intermediate, or Advanced). The catalog is unreachable until onboarding is complete. The level is stored on the account.
- AC-3: In settings the user can change display name and level, log out, delete all sessions, and delete all memory.

Scenario catalog

- AC-4: The home screen lists a catalog of 6-8 scenarios. Each entry shows a title, a one-line description, a target level tag, and the interaction goal (for example, "order a drink and pay").
- AC-5: Any level can start any scenario.

Session flow

- AC-6: Starting a scenario creates a practice session and Robin's first turn is in character as the counterpart, with no greeting or meta-introduction. Robin's turn is spoken through TTS and displayed as text.
- AC-7: The microphone opens automatically when Robin finishes speaking. When the user pauses (about 1-2 seconds), the utterance is transcribed and sent as the user's turn without any further action. A manual stop control ends the turn early.
- AC-8: The user can switch to typing at any time; a typed message is sent as the user's turn and Robin continues the scene.
- AC-9: Every turn from both speakers appears as text in the session transcript. Each Robin turn has a replay control that plays its audio again.
- AC-10: When the user makes a significant English error, Robin addresses it inside its reply (a correction or a better phrasing) and then continues the scene.
- AC-11: Robin ends the session when the scenario's interaction is complete. The user can also end early with a "Finish now" control. Both paths generate a debrief and display it.
- AC-12: The debrief contains a short summary of the scene, a list of the user's mistakes with corrections or better phrasings, and 2-3 targeted tips.
- AC-13: The declared level is included in the context sent to Robin on every turn. A Beginner and an Advanced user practicing the same scenario receive different vocabulary and sentence complexity.
- AC-14: If the app is closed during an unfinished session, reopening the app resumes that session with its full transcript and continues the conversation. Ended sessions cannot be resumed.

Persistence, tools, memory

- AC-15: Each session is stored server-side with scenario reference, start and end timestamps, full transcript, and debrief. Stored sessions are not shown in any user-facing history screen.
- AC-16: Robin has tools to search past sessions by keyword or topic, fetch one session by id, and list recent sessions with summaries. These tools are callable only inside Robin's agent loop, never directly by the client.
- AC-17: Robin's memory per user is written automatically after each session (durable personal facts and a learning profile: recurring mistakes, vocabulary covered, preferences) and immediately when the user asks Robin to remember something.
- AC-18: The user's memory is included in Robin's context every session. After telling Robin a fact in one session, Robin knows that fact in a later session without being told again.
- AC-19: "Delete all sessions" and "Delete all memory" in settings require confirmation and take effect immediately: after deletion, Robin's tools and context can no longer retrieve the deleted data and it is removed from storage.
- AC-20: User audio is never persisted; only transcripts and debriefs are stored.

## Edge Cases

- Duplicate email, wrong password, or password under 8 characters: a clear error is shown and no account is created or modified.
- Microphone permission denied: the session shows an explanation and typed input remains available; voice can be retried after the permission is granted.
- Speech recognition returns nothing (silence or unintelligible audio): no empty turn is sent to Robin; the app shows a short "didn't catch that" notice and reopens the mic.
- Network loss during a turn: the turn is retried with its transcript text; if the app closes, the session resumes per AC-14.
- User taps "Finish now" mid-scene: the debrief is generated from the partial conversation and covers only what happened.
- User speaks their native language or unintelligibly: Robin stays in English, gives a short hint to try in English, and continues the scene.
- New user with empty memory: Robin relies only on the scenario, level, and current conversation.
- Deletion and active sessions: settings is reachable only when no session is active, so deletion never conflicts with a running session.
- TTS unavailable or device muted: the text transcript is still displayed and the replay control is still offered.

## Non-Goals

- Language course features: lessons, grammar drills, spaced repetition, streaks, XP, or leaderboards.
- User-facing history browsing; transcripts and debriefs are visible only in the session that produced them and to Robin's tools.
- Password reset, email verification, and account deletion (separate from deleting data).
- Audio recording storage, playback, or pronunciation scoring.
- Social features, sharing, or multiplayer.
- Offline practice; network is required.
- Multiple AI personas or user-selected models.
- Payments or subscriptions.
- UI localization; app chrome is English-only.
- Admin or content-management tooling for the scenario catalog.

## Open Questions

- Q-1: Which backend runtime, database, LLM provider, and STT/TTS providers to use (blocks: nothing; resolved in Phase 2).
- Q-2: The threshold for what counts as a "significant error" for inline coaching is a prompt-design decision; no AC depends on a numeric threshold (blocks: nothing; resolved in Phase 2).

## Verification

Phase 5 ran `bun run typecheck` (clean), `bun run test` (8 suites, 61 tests, all pass), and `bunx expo export --platform web` (exports `dist`). Lint is skipped: the repo has no linter. Live authenticated runs were impossible in this environment (no test credentials, no device, and no writes to the owner's Borel project), so AC-1 and AC-3 are verified by code path only.

- AC-1: limitation (live register/login not run; code paths: `core/auth.tsx:79-82,113-137,149-165,879-884`).
- AC-2: pass (`navigation/rootRoute.test.ts`; `screens/Onboarding/index.tsx:13-37`; `api/useProfile.tsx:104-113`; `navigation/rootRoute.ts:30`).
- AC-3: limitation (live save/logout/delete not run; code paths: `screens/Settings/index.tsx:32-63,104-110`; `api/useSessions.tsx:132-138`; `api/useMemory.tsx:60-66`).
- AC-4: pass (`api/scenarios.test.ts`; `api/scenarios.ts:13-86`; `screens/Practice/index.tsx:16-36,111-114`).
- AC-5: pass (no level gate in `screens/Practice/index.tsx:52-67,111-114` or `api/useSessions.tsx:84-99`).
- AC-6: pass (`screens/Session/index.tsx:233-237,202-214`; `api/useRobin.tsx:56-58`; `api/robinPrompt.ts:15,22`; prompt test).
- AC-7: pass (`screens/Session/index.tsx:212-220,241-275`; `screens/Session/useTurnRecorder.ts:91-109`; `screens/Session/voiceActivity.ts:10,87-88`; detector tests).
- AC-8: pass (`screens/Session/index.tsx:281-294,409-429,442-444`).
- AC-9: pass (`screens/Session/index.tsx:202,268,288,372-389`).
- AC-10: pass (`api/robinPrompt.ts:23`; prompt test).
- AC-11: pass (`screens/Session/index.tsx:150-174,216-217,296-301,317-349`; agent complete-passthrough test).
- AC-12: pass (`api/useRobin.tsx:75-80`; `api/robinAgent.ts:87-101`; `screens/Session/index.tsx:317-345`; debrief tests).
- AC-13: pass (`api/robinPrompt.ts:12-21`; prompt level tests).
- AC-14: pass (`navigation/rootRoute.ts:31`; `navigation/RootNavigator.tsx:59-75`; rootRoute tests; `api/useSessions.tsx:49-55,109-117`).
- AC-15: pass (`api/useSessions.tsx:21-31,84-117`; no history screen in `screens/` or `navigation/RootNavigator.tsx:40-54`).
- AC-16: pass (`api/robinTools.ts:85-124`; tool tests; tools reachable only via `api/useRobin.tsx:59-62` into `api/robinAgent.ts:50-68`).
- AC-17: pass (`screens/Session/index.tsx:158-170,207-211`; `api/useMemory.tsx:51-58`; `api/robinPrompt.ts:29,33`).
- AC-18: pass (`api/robinPrompt.test.ts:42-57`; `screens/Session/index.tsx:188-195`; `api/useRobin.tsx:40-50`).
- AC-19: pass (`screens/Settings/index.tsx:45-63,97-107`; `api/useSessions.tsx:132-138`; `api/useMemory.tsx:60-66`).
- AC-20: pass (`api/useSessions.tsx:87-113`; `api/useMemory.tsx:54`; `screens/Session/index.tsx:242-259`; no audio upload or audio column anywhere).
