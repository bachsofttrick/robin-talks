export interface RootRouteInput {
  authLoading: boolean;
  signedIn: boolean;
  profileLoading: boolean;
  profileError: string | null;
  profileDetail: string | null;
  onboarded: boolean;
  sessionLoading: boolean;
  hasOpenSession: boolean;
}

export type RootRoute =
  | { kind: "loading" }
  | { kind: "profileError"; message: string; detail: string | null }
  | { kind: "onboarding" }
  | { kind: "tabs"; initialTab: "Practice" | "Session" };

// Decides the root stack on launch. Signed-out users land on Tabs where the
// screens show the account card. Signed-in users wait for the profile and
// open-session reads so the onboarding gate and the initial tab are decided
// on real data. A failed profile read with no onboarded profile is a
// retryable error rather than a trap in onboarding.
export function rootRoute(input: RootRouteInput): RootRoute {
  if (input.authLoading) return { kind: "loading" };
  if (!input.signedIn) return { kind: "tabs", initialTab: "Practice" };
  if (input.profileLoading || input.sessionLoading) return { kind: "loading" };
  if (input.profileError && !input.onboarded) {
    return { kind: "profileError", message: input.profileError, detail: input.profileDetail };
  }
  if (!input.onboarded) return { kind: "onboarding" };
  return { kind: "tabs", initialTab: input.hasOpenSession ? "Session" : "Practice" };
}
