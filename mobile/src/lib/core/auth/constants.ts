/**
 * Kept for screens written against older versions of this file. Confirmation
 * and password reset now work with a 6-digit code typed into the app, so no
 * email sends anyone to this page any more.
 */
export const AUTH_REDIRECT_URL = "https://api.borel.one/app/2e5ca675-84e4-4527-89dd-bedec5432801/auth/callback";

/** What Sign in with Apple says in the browser preview, where Apple's sheet cannot reach a real Apple ID. */
export const APPLE_IN_PREVIEW = "Sign in with Apple works in the app on your phone. Here in the preview, sign in with your email.";

/** What a password change says when the current password is wrong - or the account never had one of its own. */
export const WRONG_CURRENT_PASSWORD =
  "That current password is not right, and an account made with Sign in with Apple has no password to change.";

/**
 * Whether the sign-in offers "Continue with Apple". Read from
 * EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE (see .env.example); Expo inlines only
 * EXPO_PUBLIC_ variables, and it must be read with static dot access. The
 * button shows on an iPhone, and in the preview so the owner sees the screen
 * people will see; Apple's sheet itself only opens in the app on a phone.
 */
export const APPLE_SIGN_IN_AVAILABLE = process.env.EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE === "true";

export const KIT = {
  accent: "#2F6F5E",
  onAccent: "#FFFFFF",
  text: "#111111",
  muted: "#6B7280",
  line: "#E5E7EB",
  field: "#F3F4F6",
  danger: "#D92D20",
};

/** Whether "Forgot password" can do anything in this app. Borel sets it. */
export const PASSWORD_RESET_AVAILABLE = false;

/** Where a subscription is cancelled. Deleting an account here does not cancel one. */
export const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/** True in Borel's browser preview, where the session is held for the app. */
export const IN_PREVIEW = typeof document !== "undefined";

// Apple's logo, drawn rather than typed: the character for it exists only in
// Apple's own fonts, so the preview in a browser on any other computer would
// show an empty box where the logo belongs.
export const APPLE_LOGO_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";
