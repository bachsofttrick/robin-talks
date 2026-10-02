# Proposal

## Why

Pressing Continue on an unfinished session from the Practice tab can open the Session screen with an empty transcript, and the stored conversation only appears after a full page refresh. The Session screen loads a session's transcript through two effects keyed on different values (the route param and the state it writes), so re-navigating to a session that is already the current `sessionId` clears the screen without refetching it.

## What Changes

- The Session screen loads a session's stored transcript whenever it is opened with a session id, on every entry path: a fresh mount, a tab re-focus, and a re-navigation to the session already on screen.
- The screen no longer clears its transcript and readiness when the navigation target is the session it already has, since there is nothing new to reset.
- The auto-advance effect that sends the opening turn only runs for a session with an empty transcript, so a resumed session shows its history instead of restarting the conversation.

## Capabilities

### New Capabilities
- `session-resume`: How the Session screen resolves which session to show and loads that session's stored transcript when opened or resumed.

### Modified Capabilities
<!-- None. No existing capability covers session resume; ai-provider is unaffected. -->

## Impact

- `src/screens/Session/index.tsx`: the reset, load, and adopt effects (around lines 61-108) and the auto-advance effect at line 202.
- No API, schema, dependency, or data-model changes. `useSessions.fetchOne` already returns the full row.
- Behavior only; no database or navigation-contract changes.
