# Tasks

## 1. Fix session load keying

- [x] 1.1 Change the Session screen load effect to depend on the route param session id (`route.params?.sessionId`) instead of only the `sessionId` state, and verify `bun run typecheck` passes
- [x] 1.2 Guard the reset effect so it clears the transcript and readiness only when `route.params.sessionId` differs from the current `sessionId` state, and verify the screen no longer blanks on a same-session re-navigation
- [x] 1.3 Confirm the adopt effect for a null `sessionId` still sets the open session once it arrives, and verify opening the Session tab with no params shows the open session

## 2. Verify resume behavior

- [x] 2.1 Reproduce the original repro (session already shown, press Continue from Practice) and verify the stored turns appear without a refresh
- [x] 2.2 Verify a cold mount with a session id (page refresh) still shows the same turns
- [x] 2.3 Verify a session with no stored turns still starts its opening turn once, and a resumed session with turns does not send a new opening turn
- [x] 2.4 Run `bun run lint` and verify no new lint errors
