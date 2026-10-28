# Tasks: Microphone permission resets Session to Practice

Status: complete
Plan: PLAN.md

## Wave 1
- [x] T1: Stabilize profile loading across same-account authentication refreshes
  - Files: apps/mobile/src/lib/api/useProfile.tsx, apps/mobile/src/lib/api/data-hooks.test.tsx, apps/mobile/src/screens/Session/index.tsx
  - Do: Demonstrate a failing same-account user-object replacement regression, key profile work by account ID, invalidate stale account-lifetime asynchronous operations, and expose voice controls after successful recording startup.
  - Done when: Regression changes from failing to passing; lint, type check, and unit tests pass; use `bun run android` to deploy changed code and verify permission grant and already-granted recording stay on Session with visible recording controls on Bach's A25.

## Candidate History

- Candidate 1: Implementation worker demonstrated the regression failing with loading changing to `[false, true]`; after the fix, the 27 data-hook tests, mobile lint, and mobile typecheck passed.
- Candidate 1 independent verification: Root lint/typecheck/test passed (mobile 168 tests, backend 145 tests, cached). `bun run android` built and installed changed code on Bach's A25. Permission grant, repeated recording, and background/foreground retained Session/transcript. Full acceptance failed because granting permission left the typing composer visible over active recording. Candidate 1 was explicitly reversed before candidate 2.
- Candidate 2: A new implementation worker restored the original profile hook/tests, confirmed the reversal through codegraph, then reapplied the account-ID fix and added `setTyping(false)` only after successful recording startup. Targeted 27 data-hook tests, mobile lint, and mobile typecheck passed. Independent checks and device verification passed.

## Final Verification

- Root `bun run lint` and `bun run typecheck`: passed, mobile freshly executed and backend cached.
- Root `CI=1 bun run test`: passed, mobile 168 tests across 11 suites freshly executed; backend 145 passed, 0 failed from Turbo cache.
- Android build/deployment, using the user's requested command: `ANDROID_SERIAL=R5CX923YPQK CI=1 bun run android` in `apps/mobile` exited 0, reported `BUILD SUCCESSFUL in 3s`, installed `android/app/build/outputs/apk/debug/app-debug.apk`, and opened Robin Talks on SM-A256E. Existing Metro 8081 was reused. A cold app launch and Metro source map confirmed candidate 2 code was served to the connected device.
- Bach's A25 permission grant: Session and transcript remained; Stop and send and discard controls appeared automatically without a typing-to-mic switch, and persisted through a 12-second observation period.
- Two additional already-granted start/discard cycles: passed, Session and transcript preserved.
- Permission denial: passed, Session retained typing fallback. Microphone permission restored to Allow only while using the app.
- Background/foreground while idle: passed after 12 seconds backgrounded and 12 seconds foregrounded, Session and transcript preserved.
- Final device state: foreground Session / Ordering coffee, idle, microphone allowed while using the app.
- `git diff --check`: passed.
