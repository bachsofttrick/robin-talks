import type { AuthResult } from "./types";

export const SUCCESS: AuthResult = { ok: true, needsEmailConfirmation: false, error: null };

export function failed(message: string): AuthResult {
  return { ok: false, needsEmailConfirmation: false, error: message };
}

/**
 * The server's error, as a sentence for the person holding the phone.
 *
 * Anything unrecognised falls through to its own message rather than to a
 * generic one: an unfamiliar but accurate error beats "Something went wrong".
 */
export function authErrorMessage(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const text = raw.toLowerCase().replace(/_/g, " ");

  if (!text) return "Something went wrong. Please try again.";
  if (text.includes("invalid email or password") || text.includes("invalid login credentials") || text.includes("invalid password")) {
    return "That email and password do not match an account.";
  }
  if (text.includes("email not verified") || text.includes("email not confirmed")) {
    return "Confirm your email first - enter the code we emailed you.";
  }
  if (text.includes("invalid otp") || text.includes("otp expired") || text.includes("invalid code") || text.includes("code expired")) {
    return "That code is wrong or has expired. Ask for a new one.";
  }
  if (text.includes("too many attempts")) return "Too many tries. Ask for a new code.";
  if (text.includes("already exists") || text.includes("already registered") || text.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (text.includes("password too short") || text.includes("at least")) return "Use at least 8 characters.";
  if (text.includes("password too long")) return "That password is too long.";
  if (text.includes("invalid email")) return "That does not look like a valid email address.";
  if (text.includes("rate limit") || text.includes("too many requests")) return "Too many attempts. Wait a minute and try again.";
  if (text.includes("signups not allowed") || text.includes("sign up disabled") || text.includes("signup disabled")) {
    return "New accounts are not being accepted right now.";
  }
  if (text.includes("network") || text.includes("failed to fetch")) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return raw;
}

export function displayNameFor(email: string, metadata?: Record<string, unknown>): string {
  const fromMetadata = metadata && (metadata.name || metadata.display_name || metadata.full_name);
  if (typeof fromMetadata === "string" && fromMetadata.trim()) return fromMetadata.trim();
  const local = email.split("@")[0] || "there";
  return local.replace(/[._-]+/g, " ").trim() || "there";
}

export function madeWithoutSession(error: unknown): boolean {
  const e = (error || {}) as { code?: unknown; message?: unknown };
  return e.code === "session_not_found" || String(e.message || "").toLowerCase().includes("failed to retrieve user session");
}
