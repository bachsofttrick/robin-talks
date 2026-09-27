import { rootRoute } from "./rootRoute";
import type { RootRouteInput } from "./rootRoute";

function base(overrides: Partial<RootRouteInput> = {}): RootRouteInput {
  return {
    authLoading: false,
    signedIn: true,
    profileLoading: false,
    profileError: null,
    profileDetail: null,
    onboarded: true,
    sessionLoading: false,
    hasOpenSession: false,
    ...overrides,
  };
}

describe("rootRoute", () => {
  test("loading while auth is loading", () => {
    expect(rootRoute(base({ authLoading: true, signedIn: false }))).toEqual({ kind: "loading" });
  });

  test("loading while the signed-in profile read is in flight", () => {
    expect(rootRoute(base({ profileLoading: true }))).toEqual({ kind: "loading" });
  });

  test("loading while the signed-in open-session read is in flight", () => {
    expect(rootRoute(base({ sessionLoading: true }))).toEqual({ kind: "loading" });
  });

  test("signed-out users get Tabs on Practice without waiting on reads", () => {
    expect(
      rootRoute(
        base({ signedIn: false, profileLoading: true, sessionLoading: true, onboarded: false, hasOpenSession: false }),
      ),
    ).toEqual({ kind: "tabs", initialTab: "Practice" });
  });

  test("failed profile read with no onboarded profile is a retryable error", () => {
    expect(
      rootRoute(
        base({ onboarded: false, profileError: "Could not load your profile.", profileDetail: "row missing" }),
      ),
    ).toEqual({ kind: "profileError", message: "Could not load your profile.", detail: "row missing" });
  });

  test("failed profile read with a null detail still reports the error", () => {
    expect(rootRoute(base({ onboarded: false, profileError: "Could not load your profile." }))).toEqual({
      kind: "profileError",
      message: "Could not load your profile.",
      detail: null,
    });
  });

  test("failed profile read with an onboarded profile still lands on Tabs", () => {
    expect(rootRoute(base({ onboarded: true, profileError: "Could not load your profile." }))).toEqual({
      kind: "tabs",
      initialTab: "Practice",
    });
  });

  test("signed-in users without an onboarded profile get Onboarding", () => {
    expect(rootRoute(base({ onboarded: false }))).toEqual({ kind: "onboarding" });
  });

  test("onboarded users with no open session get Tabs on Practice", () => {
    expect(rootRoute(base({ onboarded: true, hasOpenSession: false }))).toEqual({
      kind: "tabs",
      initialTab: "Practice",
    });
  });

  test("onboarded users with an unfinished session get Tabs on Session", () => {
    expect(rootRoute(base({ onboarded: true, hasOpenSession: true }))).toEqual({
      kind: "tabs",
      initialTab: "Session",
    });
  });
});
