import { db, authCall, adoptSession, appleCall } from "../db";
import { signInWithApple as appleSheet } from "../borel/borel-systemui";
import type { User, AuthResult } from "./types";
import { SUCCESS, failed, authErrorMessage, displayNameFor, madeWithoutSession } from "./errors";
import { AUTH_REDIRECT_URL, APPLE_IN_PREVIEW, WRONG_CURRENT_PASSWORD } from "./constants";

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
  const r = await authCall("/forget-password/email-otp", { email: email.trim() });
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
 * Set a new password for the user who is already signed in. The current
 * password is required: the server will not change one without it.
 */
export async function updatePassword(password: string, currentPassword?: string): Promise<AuthResult> {
  if (!currentPassword) return failed("Enter your current password first.");
  try {
    const better = (db.auth as unknown as { getBetterAuthInstance?: () => any }).getBetterAuthInstance?.();
    // Only the preview has no password change of its own (the session lives on Borel there).
    if (!better || !better.changePassword) return failed("You can change your password in the app on your phone.");
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
 * Delete the signed-in person's account, for real: the sign-in, every row of
 * theirs in this app's tables, and every file they uploaded are removed on the
 * server, and then this device is signed out. Apple requires this inside any
 * app that has accounts (Guideline 5.1.1(v)).
 *
 * Ask for confirmation BEFORE calling it - it cannot be undone. On ok, the
 * provider has already moved to the signed-out state. On not ok, the person is
 * still signed in and `error` says what to do.
 */
export async function deleteAccount(): Promise<AuthResult> {
  const result = await db.account.delete();
  if (!result.ok) return failed(result.error || "Your account couldn't be deleted. Please try again.");
  await signOut();
  return SUCCESS;
}

/**
 * Sign in with Apple: Apple's own sheet, then an account in this app's cloud.
 *
 * Borel issues a one-time nonce, Apple signs it into the identity token, and
 * Borel checks the token and signs the person in (the first time making their
 * account), handing back a session this app keeps like its own. On ok the
 * person is signed in. `cancelled` means they closed Apple's sheet: show
 * nothing. Otherwise `error` is a sentence to show.
 */
export async function signInWithApple(): Promise<AuthResult & { cancelled?: boolean }> {
  if (typeof document !== "undefined") return failed(APPLE_IN_PREVIEW);
  const issued = await appleCall("/nonce", {});
  const nonce = issued.json && typeof issued.json.nonce === "string" ? issued.json.nonce : null;
  if (!issued.ok || !nonce) {
    return failed(typeof issued.json?.error === "string" ? issued.json.error : "Sign in with Apple isn't available right now, so please sign in with your email.");
  }
  const sheet: any = await appleSheet({ nonce });
  if (!sheet || sheet.status === "cancelled") return { ok: false, needsEmailConfirmation: false, error: null, cancelled: true };
  if (sheet.status !== "success" || !sheet.identityToken) {
    return failed("Sign in with Apple isn't available on this device, so please sign in with your email.");
  }
  const answer = await appleCall("/sign-in", {
    identityToken: sheet.identityToken,
    nonce,
    authorizationCode: sheet.authorizationCode ?? null,
    fullName: sheet.fullName ?? null,
  });
  if (!answer.ok || !answer.json || !Array.isArray(answer.json.setCookie)) {
    return failed(typeof answer.json?.error === "string" ? answer.json.error : "Sign-in couldn't be finished right now, so please try again in a moment.");
  }
  await adoptSession(answer.json.setCookie);
  return SUCCESS;
}

// One row per person in public.profiles, kept by this file so no screen has
// to. Best-effort and once per user per launch: a profile that fails to sync
// is not a sign-in that failed.
const synced = new Set<string>();
export async function syncProfile(user: User | null | undefined): Promise<void> {
  if (!user || !user.id || synced.has(user.id)) return;
  synced.add(user.id);
  try {
    await db.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: (user.name as string | undefined) ?? null,
        avatar_url: (user.image as string | undefined) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    synced.delete(user.id);
  }
}
