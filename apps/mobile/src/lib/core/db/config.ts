import Constants from "expo-constants";

export const DATA_API_URL = process.env.EXPO_PUBLIC_DATA_API_URL ?? "";
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? "";
// The Hono better-auth service in apps/backend, mounted at /api/auth. This is
// the full base the native auth client talks to, e.g. https://host/api/auth.
export const BACKEND_AUTH_URL = process.env.EXPO_PUBLIC_BACKEND_AUTH_URL ?? "";
export const PREVIEW_AUTH_URL = process.env.EXPO_PUBLIC_PREVIEW_AUTH_URL ?? "";
export const BOREL_STORAGE = process.env.EXPO_PUBLIC_BOREL_STORAGE ?? "";
export const BOREL_AI = process.env.EXPO_PUBLIC_BOREL_AI ?? "";
export const BOREL_ACCOUNT = process.env.EXPO_PUBLIC_BOREL_ACCOUNT ?? "";
export const BOREL_USAGE_URL = process.env.EXPO_PUBLIC_BOREL_USAGE_URL ?? "";
export const BOREL_INVITE_URL = process.env.EXPO_PUBLIC_BOREL_INVITE_URL ?? "";
export const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? "";

/**
 * The link to share for one of this app's invite codes (a group's join code,
 * an event's RSVP code): pass it to shareContent({ message, url }). On a phone
 * with this app it opens the app, which receives the code through
 * useIncomingLink() from borel-systemui; everywhere else it opens a page that
 * offers the app and shows the code to type in.
 */
export function createInviteLink(code: string): string {
  return BOREL_INVITE_URL + "/" + encodeURIComponent(String(code == null ? "" : code).trim());
}

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
