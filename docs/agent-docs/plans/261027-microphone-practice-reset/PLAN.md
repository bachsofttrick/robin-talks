# Bugfix: Microphone permission resets Session to Practice

Status: approved
Approval: The user authorized iterative worker-agent implementation and device testing, reverting failed candidates before trying another.
Bug report: Enabling the microphone in Session and granting Android permission apparently relaunches the locally built APK to signed-in Practice.

## Analysis

Foreground restoration in `apps/mobile/src/lib/core/auth/context.tsx:44-48,90-95` publishes a newly fetched user object. The original `apps/mobile/src/lib/api/useProfile.tsx:25-57` depends on that object's identity, causing a fresh profile load and `loading: true` even for the same account. `apps/mobile/src/navigation/RootNavigator.tsx:74-80` replaces the navigator with a splash during profile loading, discarding Session navigation state. The remounted tabs begin at Practice (`:38-43`). A regression test confirmed that replacing the user object with the same ID triggers loading on the original implementation.

## Reproduction

Read-only diagnosis workers used Bach's A25 (Android 14), opened Ordering coffee, denied microphone permission in Android settings, tapped Speak your reply and Turn the microphone on, and granted While using the app. The destination was signed-in Practice with tabs instead of Session with Stop and send. The reset also occurred with permission already granted. Logs showed the same process ID and no matching crash report; a native process crash was not established.

## Fix Approach

Candidate 1 makes account-scoped profile callbacks depend on the primitive account ID. A same-account authentication refresh then preserves the loaded profile and navigator. Account changes and signout continue to reload or clear the profile. Guard asynchronous operations against obsolete account lifetimes. Verify the regression, account-transition behavior, project checks, and a newly built APK on Bach's A25. Revert candidate-specific changes if the device verification fails before implementing a different candidate.

Candidate 2 reapplies the profile fix after explicitly reversing candidate 1, and clears typing mode only after recording starts successfully. Device testing of candidate 1 confirmed that the permission-denial fallback otherwise remains visible and hides active recording controls. Use `bun run android` for build/deployment, as explicitly requested by the user.

## Affected Code

- `apps/mobile/src/lib/api/useProfile.tsx`: stabilize profile loading across same-account auth refreshes and guard stale asynchronous results.
- `apps/mobile/src/lib/api/data-hooks.test.tsx`: regression coverage for same-account refresh and account-lifetime behavior.
- `apps/mobile/src/screens/Session/index.tsx`: leave typing mode when microphone recording starts successfully.
