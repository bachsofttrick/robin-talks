import { db, authCall } from "../db";
import { upsertProfile } from "../db/data";
import type { User, AuthResult } from "./types";
import { SUCCESS, failed, authErrorMessage, displayNameFor, madeWithoutSession } from "./errors";
import { AUTH_REDIRECT_URL, WRONG_CURRENT_PASSWORD } from "./constants";

/**
 * Create an account.
 *
 * Three outcomes, and they are genuinely different things to show:
 *   - ok, not needing confirmation: a session exists and the user is signed in
 *     RIGHT NOW. Send them into the app. Do not mention email.
 *   - ok, needing confirmation: the account exists, there is no session, and a
 *     6-digit code is on its way. Show a code field and call confirmEmail(email,
 *     code). This is the only case where "check your inbox" is true.
 *   - not ok: show `error`.
 */
export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
): Promise<AuthResult> {
  try {
    const trimmed = email.trim();
    const { data, error } = await db.auth.signUp({
      email: trimmed,
      password,
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL,
        data: { name: displayNameFor(trimmed, metadata), ...(metadata || {}) },
      },
    });
    // On a phone, neon-js answers an account made WITHOUT a session (the app
    // confirms email) with this error rather than an empty session: the
    // account exists and the code is on its way.
    if (error && madeWithoutSession(error)) return { ok: true, needsEmailConfirmation: true, error: null };
    if (error) return failed(authErrorMessage(error));
    if (data.session) {
      await syncProfile(data.session.user as User);
      return SUCCESS;
    }
    return { ok: true, needsEmailConfirmation: true, error: null };
  } catch (err) {
    return failed(authErrorMessage(err));
  }
}

/** Sign in with an existing account. */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) {
      if (data.session) await syncProfile(data.session.user as User);
      return SUCCESS;
    }
    // The one failure that is not a wrong password and must not be shown as
    // one: the account is real, the password was right, and the email has
    // simply not been confirmed yet. A screen that offers "resend" here is the
    // difference between recoverable and stuck.
    const unconfirmed = String(error.message || "").toLowerCase().replace(/_/g, " ").includes("email not verified");
    return { ok: false, needsEmailConfirmation: unconfirmed, error: authErrorMessage(error) };
  } catch (err) {
    return failed(authErrorMessage(err));
  }
}

/** Sign out. Never throws - a failed sign-out still clears the local session. */
export async function signOut(): Promise<void> {
  try {
    await db.auth.signOut();
  } catch {
    // Nothing to tell the user: the session is gone from this device either way.
  }
}

/**
 * "Forgot password", step one: email a 6-digit reset code to this address.
 *
 * ok does not mean the address has an account - the server never says, so no
 * one can use this screen to find out who is signed up. Say "If that email has
 * an account, we sent it a code", then show the step-two screen.
 */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const r = await authCall("/email-otp/request-password-reset", { email: email.trim() });
  return r.ok ? SUCCESS : failed(authErrorMessage(r.error));
}

/**
 * "Forgot password", step two: the code from the email and the new password.
 * On ok the password is changed; send the person to sign in with it.
 */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<AuthResult> {
  const r = await authCall("/email-otp/reset-password", { email: email.trim(), otp: code.trim(), password: newPassword });
  return r.ok ? SUCCESS : failed(authErrorMessage(r.error));
}

/**
 * Confirm a new account's email with the 6-digit code sent at sign-up. On ok
 * the person is usually signed in straight away; if `useAuth().signedIn` is
 * still false afterwards, sign them in with the email and password they chose.
 */
export async function confirmEmail(email: string, code: string): Promise<AuthResult> {
  try {
    const { data, error } = await db.auth.verifyOtp({ type: "signup", email: email.trim(), token: code.trim() });
    if (error) return failed(authErrorMessage(error));
    if (data && data.session) await syncProfile(data.session.user as User);
    return SUCCESS;
  } catch (err) {
    return failed(authErrorMessage(err));
  }
}

/**
 * The live better-auth client behind the Supabase-shaped auth adapter.
 */
function betterAuthInstance(): any {
  return (db.auth as unknown as { getBetterAuthInstance?: () => any }).getBetterAuthInstance?.();
}

/**
 * Set a new password for the user who is already signed in. The current
 * password is required: the server will not change one without it.
 */
export async function updatePassword(password: string, currentPassword?: string): Promise<AuthResult> {
  if (!currentPassword) return failed("Enter your current password first.");
  try {
    const better = betterAuthInstance();
    if (!better || !better.changePassword) return failed("Your password couldn't be changed. Please try again.");
    const res = await better.changePassword({ newPassword: password, currentPassword, revokeOtherSessions: false });
    if (!res || !res.error) return SUCCESS;
    const said = String(res.error.message || res.error.code || "").toLowerCase().replace(/_/g, " ");
    return failed(said.includes("invalid password") ? WRONG_CURRENT_PASSWORD : authErrorMessage(res.error));
  } catch (err) {
    return failed(authErrorMessage(err));
  }
}

/** Email a new confirmation code, for an account that never confirmed. */
export async function resendConfirmation(email: string): Promise<AuthResult> {
  const r = await authCall("/email-otp/send-verification-otp", { email: email.trim(), type: "email-verification" });
  return r.ok ? SUCCESS : failed(authErrorMessage(r.error));
}

/**
 * Delete the signed-in person's account, for real: the backend better-auth
 * service removes the user and every session of theirs, and then this device is
 * signed out. Apple requires this inside any app that has accounts (Guideline
 * 5.1.1(v)).
 *
 * Ask for confirmation BEFORE calling it - it cannot be undone. On ok, the
 * provider has already moved to the signed-out state. On not ok, the person is
 * still signed in and `error` says what to do.
 */
export async function deleteAccount(): Promise<AuthResult> {
  const better = betterAuthInstance();
  if (!better || !better.deleteUser) return failed("Your account couldn't be deleted. Please try again.");
  try {
    const res = await better.deleteUser();
    if (res && res.error) return failed(authErrorMessage(res.error));
    await signOut();
    return SUCCESS;
  } catch (err) {
    return failed(authErrorMessage(err));
  }
}

// One row per person in public.profiles, kept by this file so no screen has
// to. Best-effort and once per user per launch: a profile that fails to sync
// is not a sign-in that failed.
const synced = new Set<string>();
export async function syncProfile(user: User | null | undefined): Promise<void> {
  if (!user || !user.id || synced.has(user.id)) return;
  synced.add(user.id);
  try {
    await upsertProfile({
      email: user.email ?? null,
      display_name: (user.name as string | undefined) ?? null,
      avatar_url: (user.image as string | undefined) ?? null,
    });
  } catch {
    synced.delete(user.id);
  }
}
