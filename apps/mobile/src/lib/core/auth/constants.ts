import { BACKEND_AUTH_URL } from "../db/config";

/**
 * Kept for screens written against older versions of this file. Confirmation
 * and password reset now work with a 6-digit code typed into the app, so no
 * email sends anyone to this page any more. The backend host is the default.
 */
export const AUTH_REDIRECT_URL = BACKEND_AUTH_URL;

/** What a password change says when the current password is wrong. */
export const WRONG_CURRENT_PASSWORD = "That current password is not right.";

export const KIT = {
  accent: "#2F6F5E",
  onAccent: "#FFFFFF",
  text: "#111111",
  muted: "#6B7280",
  line: "#E5E7EB",
  field: "#F3F4F6",
  danger: "#D92D20",
};

/** Whether "Forgot password" can do anything in this app. The backend serves it. */
export const PASSWORD_RESET_AVAILABLE = true;

/** Where a subscription is cancelled. Deleting an account here does not cancel one. */
export const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/** True in Borel's browser preview, where the session is held for the app. */
export const IN_PREVIEW = typeof document !== "undefined";
