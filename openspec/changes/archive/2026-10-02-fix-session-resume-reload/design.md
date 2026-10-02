# Design

## Context

See proposal.md - Why. The Session screen is a bottom-tab screen (`src/navigation/RootNavigator.tsx:42`), so React Navigation keeps it mounted across tab switches instead of remounting it. Its current state is driven by three effects in `src/screens/Session/index.tsx`:

- the reset effect (L61-71), keyed on `route.params?.sessionId` and `route.params?.scenarioId`, which clears the transcript and sets `ready` false;
- the load effect (L76-96), keyed on the `sessionId` state, which calls `fetchOne` and fills the transcript;
- the adopt effect (L101-108), keyed on `openSession` and `sessionId`, which only runs when `sessionId` is null.

The reset effect fires on the route param while the load effect fires on the state. When a navigation sets the route param to the value the state already holds, the reset runs and the load does not, so the screen is left empty. A full page refresh remounts the screen with the state initialized from the route param, so the load runs and the data appears.

## Goals / Non-Goals

**Goals:**
- Load a session's stored transcript on every entry path, including re-navigation to the session already on screen.
- Keep the reset meaningful: it should clear the screen only when the target session actually changes.

**Non-Goals:**
- Changing the navigation contract, route params, or the `useSessions` hook's public surface.
- Changing how sessions are created, saved, or finished.
- Introducing tests or a new state library.

## Decisions

**Key the load effect on the route param session id, not only the state.**

The route param is the single source of truth for which session the screen was asked to open. Making the load effect depend on it means every navigation that names a session triggers a load, and the state is a derived display value rather than a second key. Alternative considered: make the reset effect a no-op when `route.params.sessionId === sessionId`. That fixes the reported repro with a smaller diff but leaves two effects keyed on different values, so the class of bug can return. Alternative considered: collapse all three effects into one keyed on the route param. Cleanest, but a larger rewrite than a targeted bug fix warrants and it touches the null-session adopt path.

**Reset only when the target session changes.**

The reset should guard on `route.params.sessionId` differing from the current state, so re-navigating to the same session does not clear a conversation that is about to be reloaded anyway.

**Keep the auto-advance guard on an empty transcript.**

The auto-advance effect (L202) already requires `transcript.length === 0`, so once the load fills a resumed transcript the opening turn is not sent. This requirement is preserved, not changed; the fix makes the load reliable enough for the guard to matter.

## Risks / Trade-offs

- [Load effect re-runs more often, including on a tab re-focus that re-passes the same param] -> `fetchOne` is a single indexed row read; an extra fetch is cheap and always shows current data. If this proves noisy, memoize on the resolved id.
- [Two effects still coordinate reset and load] -> Mitigated by keying both on the route param so they agree on the target, and by guarding the reset against a no-op.
- [No automated coverage for the tab-remount path] -> The spec scenarios name the tab re-navigation case explicitly so it can be verified by hand or added as a test.
