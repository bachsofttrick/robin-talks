import Constants from "expo-constants";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const BACKEND_AUTH_URL = BACKEND_URL ? BACKEND_URL + "/auth" : "";
export const BACKEND_DATA_URL = BACKEND_URL ? BACKEND_URL + "/data" : "";
export const BACKEND_AI_URL = BACKEND_URL ? BACKEND_URL + "/ai" : "";

// The in-browser preview is Expo running on the web, in a sandbox; a phone or a
// published build is native, where there is no `document`. Only the browser
// preview uses Borel's brokered session; native keeps its own, exactly as a
// shipped app does.
export const IN_BROWSER = typeof document !== "undefined";

// ---------------------------------------------------------------------------
// Which surface this is. It decides only what a refusal SAYS: the owner in the
// preview or Expo Go is told to add balance; a person using the store build is
// told the feature is unavailable and nothing more. The store build carries a
// stamp in its config that Borel minted for it; Expo Go and the preview never
// do. Same rule as Borel's analytics module: Expo Go is detected explicitly.
// ---------------------------------------------------------------------------

const RUNTIME = (Constants && Constants.expoConfig && Constants.expoConfig.extra && (Constants.expoConfig.extra as any).borelRuntime) || null;
const IS_DEV_SURFACE =
  Boolean((globalThis as any).__DEV__) ||
  (Constants && (Constants as any).appOwnership === "expo") ||
  (Constants && (Constants as any).executionEnvironment === "storeClient");
export const SURFACE: "preview" | "dev" | "release" = IN_BROWSER
  ? "preview"
  : IS_DEV_SURFACE
    ? "dev"
    : RUNTIME && RUNTIME.surface === "release"
      ? "release"
      : "dev";
export const BUILD_STAMP: string | null = SURFACE === "release" && RUNTIME && typeof RUNTIME.buildStamp === "string" ? RUNTIME.buildStamp : null;

/** Sent on every call to Borel, so a refusal can be worded for whoever is reading. */
export function borelHeaders(): Record<string, string> {
  return { "X-Borel-Surface": SURFACE, ...(BUILD_STAMP ? { "X-Borel-Build": BUILD_STAMP } : {}) };
}
