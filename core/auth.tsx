// Managed by Borel. This file is generated and kept in sync automatically.
// Editing it by hand will be overwritten the next time your backend changes.
//
// Everything about accounts: the current session, and the calls a login and
// account screen make (deleteAccount included). Import from here rather than calling db.auth directly - the
// results below are already translated into what a screen needs to show.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { db, authCall, adoptSession, appleCall } from "./db";
import { signInWithApple as appleSheet } from "../borel-systemui";

/**
 * Kept for screens written against older versions of this file. Confirmation
 * and password reset now work with a 6-digit code typed into the app, so no
 * email sends anyone to this page any more.
 */
export const AUTH_REDIRECT_URL = "https://api.borel.one/app/2e5ca675-84e4-4527-89dd-bedec5432801/auth/callback";

/** The signed-in person. `id` is text, not a UUID. */
export interface User {
  id: string;
  email: string | null;
  name?: string | null;
  image?: string | null;
  [key: string]: unknown;
}

export interface Session {
  user: User;
  access_token?: string;
  [key: string]: unknown;
}

export interface AuthResult {
  /** The call did what it was asked to. */
  ok: boolean;
  /**
   * The account exists but cannot sign in until the 6-digit code emailed to
   * the user is entered (show a code field and call `confirmEmail`). Read from
   * what the server actually returned, so branch on it - never assume an app
   * either does or does not confirm by email.
   */
  needsEmailConfirmation: boolean;
  /** A sentence that can be shown to the user as-is. Null when ok. */
  error: string | null;
}

const SUCCESS: AuthResult = { ok: true, needsEmailConfirmation: false, error: null };

function failed(message: string): AuthResult {
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

function displayNameFor(email: string, metadata?: Record<string, unknown>): string {
  const fromMetadata = metadata && (metadata.name || metadata.display_name || metadata.full_name);
  if (typeof fromMetadata === "string" && fromMetadata.trim()) return fromMetadata.trim();
  const local = email.split("@")[0] || "there";
  return local.replace(/[._-]+/g, " ").trim() || "there";
}

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

function madeWithoutSession(error: unknown): boolean {
  const e = (error || {}) as { code?: unknown; message?: unknown };
  return e.code === "session_not_found" || String(e.message || "").toLowerCase().includes("failed to retrieve user session");
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

/** What a password change says when the current password is wrong - or the account never had one of its own. */
const WRONG_CURRENT_PASSWORD =
  "That current password is not right, and an account made with Sign in with Apple has no password to change.";

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

/** What Sign in with Apple says in the browser preview, where Apple's sheet cannot reach a real Apple ID. */
export const APPLE_IN_PREVIEW = "Sign in with Apple works in the app on your phone. Here in the preview, sign in with your email.";

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
async function syncProfile(user: User | null | undefined): Promise<void> {
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

export interface AuthState {
  /** True until the stored session has been read. Show a splash, not a login screen. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Convenience for the usual conditional render. */
  signedIn: boolean;
}

export interface AuthContextValue extends AuthState {
  signUp: typeof signUp;
  signIn: typeof signIn;
  signOut: typeof signOut;
  sendPasswordReset: typeof sendPasswordReset;
  updatePassword: typeof updatePassword;
  resendConfirmation: typeof resendConfirmation;
  deleteAccount: typeof deleteAccount;
  confirmEmail: typeof confirmEmail;
  resetPassword: typeof resetPassword;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Wrap the app in this once, at the root, above the navigator.
 *
 * `loading` is the part worth respecting: on launch the stored session is read
 * asynchronously, and an app that renders its login screen during that gap
 * flashes it at every already-signed-in user, every single launch.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, user: null, signedIn: false });

  useEffect(() => {
    let active = true;
    const apply = (session: Session | null) => {
      if (!active) return;
      const user = session ? (session.user as User) : null;
      setState({ loading: false, session, user, signedIn: Boolean(session) });
      if (user) void syncProfile(user);
    };

    db.auth
      .getSession()
      .then(({ data }: { data: { session: unknown } }) => apply((data.session as Session | null) ?? null))
      // A session that cannot be read is a signed-OUT app, not a stuck one.
      .catch(() => apply(null));

    const { data } = db.auth.onAuthStateChange((_event: string, session: unknown) => apply((session as Session | null) ?? null));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signUp, signIn, signOut, sendPasswordReset, updatePassword, resendConfirmation, deleteAccount, confirmEmail, resetPassword }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The session and every auth call, from anywhere inside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth was called outside <AuthProvider>. Wrap the app in it at the root.");
  return value;
}

// ---------------------------------------------------------------------------
// The account screens themselves.
//
// Apple checks the same handful of things in every app that has accounts: that
// an account can be deleted from inside the app (Guideline 5.1.1(v)), that
// terms and privacy are where people sign up, and that a reviewer can actually
// sign in. They are written once, here, in this app's own colours, so no screen
// has to carry them and no app can get them wrong:
//
//   <AccountPanel />                  on the settings or profile screen
//   <RequireAccount reason="to save"> around what genuinely needs an account
//   <SignInSheet visible onClose />   for a single button that needs one
//   <SignInFlow />                    the whole flow, to place on a screen
// ---------------------------------------------------------------------------
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { openPrivacyPolicy, openTermsOfUse } from "./legal";

/**
 * Whether the sign-in offers "Continue with Apple". Read from
 * EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE (see .env.example); Expo inlines only
 * EXPO_PUBLIC_ variables, and it must be read with static dot access. The
 * button shows on an iPhone, and in the preview so the owner sees the screen
 * people will see; Apple's sheet itself only opens in the app on a phone.
 */
export const APPLE_SIGN_IN_AVAILABLE = process.env.EXPO_PUBLIC_APPLE_SIGN_IN_AVAILABLE === "true";

const KIT = {
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
const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export interface AccountKitLabels {
  signIn: string;
  signUp: string;
  email: string;
  password: string;
  newPassword: string;
  currentPassword: string;
  code: string;
  forgot: string;
  haveAccount: string;
  noAccount: string;
  sendCode: string;
  resend: string;
  resent: string;
  confirmTitle: string;
  confirmBody: string;
  resetTitle: string;
  resetBody: string;
  resetSent: string;
  continue: string;
  cancel: string;
  signedInAs: string;
  changePassword: string;
  signOut: string;
  deleteAccount: string;
  deleteTitle: string;
  deleteBody: string;
  deleteSubscription: string;
  manageSubscriptions: string;
  deleteConfirm: string;
  deleted: string;
  terms: string;
  privacy: string;
  agree: string;
  passwordRule: string;
  changedPassword: string;
  wrongCurrentPassword: string;
  previewPassword: string;
  signInPrompt: string;
  continueWithApple: string;
  or: string;
  appleInPreview: string;
}

const LABELS: AccountKitLabels = {
  signIn: "Sign in",
  signUp: "Create account",
  email: "Email",
  password: "Password",
  newPassword: "New password",
  currentPassword: "Current password",
  code: "6-digit code",
  forgot: "Forgot password?",
  haveAccount: "Already have an account? Sign in",
  noAccount: "New here? Create an account",
  sendCode: "Send me a code",
  resend: "Send a new code",
  resent: "We sent you a new code.",
  confirmTitle: "Check your email",
  confirmBody: "Enter the 6-digit code we sent you.",
  resetTitle: "Reset your password",
  resetBody: "Enter your email and we will send you a code.",
  resetSent: "If that email has an account, we sent it a code.",
  continue: "Continue",
  cancel: "Cancel",
  signedInAs: "Signed in as",
  changePassword: "Change password",
  signOut: "Sign out",
  deleteAccount: "Delete account",
  deleteTitle: "Delete your account?",
  deleteBody: "This deletes your account and everything in it, on this phone and on our servers. It cannot be undone.",
  deleteSubscription: "A subscription is not cancelled by this. Cancel it in your Apple ID settings.",
  manageSubscriptions: "Manage subscriptions",
  deleteConfirm: "Delete my account",
  deleted: "Your account has been deleted.",
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  agree: "By creating an account you agree to the",
  passwordRule: "At least 8 characters.",
  changedPassword: "Your password has been changed.",
  wrongCurrentPassword: WRONG_CURRENT_PASSWORD,
  previewPassword: "You can change your password in the app on your phone.",
  signInPrompt: "Sign in",
  continueWithApple: "Continue with Apple",
  or: "or",
  appleInPreview: APPLE_IN_PREVIEW,
};

function labelsWith(custom?: Partial<AccountKitLabels>): AccountKitLabels {
  return custom ? { ...LABELS, ...custom } : LABELS;
}

/** True in Borel's browser preview, where the session is held for the app. */
const IN_PREVIEW = typeof document !== "undefined";

/**
 * The session, with or without a provider above.
 *
 * The kit is in every app that has this file, including apps that never mount
 * <AuthProvider> because they only use the database. The app-facing hook above
 * throws when there is no provider, so this one reads the context when there is
 * one and subscribes on its own when there is not - same hooks either way.
 */
function useKitSession(): AuthState {
  const fromProvider = useContext(AuthContext);
  const hasProvider = fromProvider !== null;
  const [own, setOwn] = useState<AuthState>({ loading: true, session: null, user: null, signedIn: false });

  useEffect(() => {
    if (hasProvider) return;
    let active = true;
    const apply = (session: Session | null) => {
      if (!active) return;
      const user = session ? (session.user as User) : null;
      setOwn({ loading: false, session, user, signedIn: Boolean(session) });
      if (user) void syncProfile(user);
    };
    db.auth
      .getSession()
      .then(({ data }: { data: { session: unknown } }) => apply((data.session as Session | null) ?? null))
      .catch(() => apply(null));
    const { data } = db.auth.onAuthStateChange((_event: string, session: unknown) => apply((session as Session | null) ?? null));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hasProvider]);

  return hasProvider ? (fromProvider as AuthState) : own;
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  secure?: boolean;
  keyboard?: "email-address" | "number-pad" | "default";
  textContentType?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 6 }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure === true}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboard ?? "default"}
        textContentType={props.textContentType as never}
        autoComplete={props.autoComplete as never}
        maxLength={props.maxLength}
        style={{
          backgroundColor: KIT.field,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: KIT.text,
        }}
      />
    </View>
  );
}

function PrimaryButton(props: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: "accent" | "danger" }) {
  const background = props.tone === "danger" ? KIT.danger : KIT.accent;
  const disabled = props.disabled === true || props.busy === true;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        backgroundColor: background,
        opacity: disabled ? 0.5 : 1,
        borderRadius: 12,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      {props.busy ? <ActivityIndicator color={KIT.onAccent} /> : <Text style={{ color: KIT.onAccent, fontSize: 16, fontWeight: "600" }}>{props.title}</Text>}
    </Pressable>
  );
}

function LinkButton(props: { title: string; onPress: () => void; tone?: "muted" | "danger" }) {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: props.tone === "danger" ? KIT.danger : KIT.accent, fontSize: 15 }}>{props.title}</Text>
    </Pressable>
  );
}

// Apple's logo, drawn rather than typed: the character for it exists only in
// Apple's own fonts, so the preview in a browser on any other computer would
// show an empty box where the logo belongs.
const APPLE_LOGO_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

/**
 * "Continue with Apple", as Apple's guidelines ask for it: black, the Apple
 * logo before the words, and as large as any other way to sign in - so it is
 * placed first, full width, the same height as the buttons under it.
 */
function AppleButton(props: { title: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.busy === true}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      style={{
        backgroundColor: "#000000",
        opacity: props.busy ? 0.6 : 1,
        borderRadius: 12,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      {props.busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Svg width={17} height={17} viewBox="0 0 24 24" style={{ marginRight: 8, marginTop: -2 }}>
            <Path fill="#FFFFFF" d={APPLE_LOGO_PATH} />
          </Svg>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "600" }}>{props.title}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Problem(props: { text: string | null }) {
  if (!props.text) return null;
  return <Text style={{ color: KIT.danger, fontSize: 14, marginBottom: 12 }}>{props.text}</Text>;
}

function Note(props: { text: string | null }) {
  if (!props.text) return null;
  return <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 12 }}>{props.text}</Text>;
}

export type SignInStep = "signIn" | "signUp" | "confirm" | "forgot" | "reset";

/**
 * The whole sign-in flow: sign in, create an account, confirm an emailed code,
 * and reset a forgotten password. Place it on a screen, or open it as a sheet
 * with <SignInSheet />. It shows the terms and privacy links where an account
 * is created, because Apple looks for them there.
 */
export function SignInFlow(props: {
  mode?: "signIn" | "signUp";
  reason?: string;
  onDone?: () => void;
  labels?: Partial<AccountKitLabels>;
  accentColor?: string;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const [step, setStep] = useState<SignInStep>(props.mode === "signUp" ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const session = useKitSession();

  // Once per sign-in: both the call that signs in and the session it changes
  // say "done", and a second onDone (navigation.goBack) would pop two screens.
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (props.onDone) props.onDone();
  };
  useEffect(() => {
    if (session.signedIn) finish();
    else finished.current = false;
  }, [session.signedIn]);

  // A different step starts clean: what the last one said does not belong there.
  const go = (next: SignInStep) => {
    setError(null);
    setNote(null);
    setStep(next);
  };

  const run = async (work: () => Promise<AuthResult>, after?: (result: AuthResult) => void) => {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok && !result.needsEmailConfirmation) {
      setError(result.error);
      return;
    }
    if (after) after(result);
  };

  const onSignIn = () =>
    run(
      () => signIn(email, password),
      (result) => {
        if (result.needsEmailConfirmation) {
          setNote(t.confirmBody);
          setStep("confirm");
          if (!result.ok) {
            void resendConfirmation(email).then((sent) => {
              if (!sent.ok) setError(sent.error);
            });
          }
        } else finish();
      },
    );

  const onSignUp = () =>
    run(
      () => signUp(email, password),
      (result) => {
        if (result.needsEmailConfirmation) {
          setNote(t.confirmBody);
          setStep("confirm");
        } else finish();
      },
    );

  const onConfirm = () =>
    run(
      () => confirmEmail(email, code),
      async () => {
        // The code is usually enough; when it is not, the password they just
        // chose is still in this screen's hands. Asked now rather than read
        // from this render: the code may have signed them in a moment ago.
        const now = await db.auth.getSession().catch(() => null);
        const signedInNow = Boolean(now && now.data && now.data.session);
        if (!signedInNow && password) await signIn(email, password);
        finish();
      },
    );

  const onResend = () =>
    run(
      () => resendConfirmation(email),
      () => setNote(t.resent),
    );

  const onForgot = () =>
    run(
      () => sendPasswordReset(email),
      () => {
        setNote(t.resetSent);
        setStep("reset");
      },
    );

  const onReset = () =>
    run(
      () => resetPassword(email, code, password),
      () => {
        setNote(t.changedPassword);
        setCode("");
        setPassword("");
        setStep("signIn");
      },
    );

  // Apple's sheet exists on an iPhone. The preview shows the button too, so the
  // owner sees the screen people will see, and says where it works.
  const showApple = APPLE_SIGN_IN_AVAILABLE && (Platform.OS === "ios" || IN_PREVIEW);
  const onApple = async () => {
    if (IN_PREVIEW) {
      setError(null);
      setNote(t.appleInPreview);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signInWithApple();
    setBusy(false);
    if (result.ok) {
      finish();
      return;
    }
    if (!result.cancelled) setError(result.error);
  };

  const heading =
    step === "signUp" ? t.signUp : step === "confirm" ? t.confirmTitle : step === "forgot" || step === "reset" ? t.resetTitle : t.signIn;

  return (
    <View style={[{ padding: 20 }, props.style as never]}>
      <Text style={{ color: KIT.text, fontSize: 24, fontWeight: "700", marginBottom: 6 }}>{heading}</Text>
      {props.reason ? <Text style={{ color: KIT.muted, fontSize: 15, marginBottom: 16 }}>{props.reason}</Text> : <View style={{ height: 10 }} />}
      <Note text={note} />
      <Problem text={error} />

      {step === "confirm" ? (
        <View>
          <Field label={t.code} value={code} onChangeText={setCode} keyboard="number-pad" textContentType="oneTimeCode" maxLength={6} />
          <PrimaryButton title={t.continue} onPress={onConfirm} busy={busy} disabled={code.trim().length < 4} />
          <LinkButton title={t.resend} onPress={onResend} />
        </View>
      ) : step === "forgot" ? (
        <View>
          <Text style={{ color: KIT.muted, fontSize: 15, marginBottom: 12 }}>{t.resetBody}</Text>
          <Field label={t.email} value={email} onChangeText={setEmail} keyboard="email-address" textContentType="emailAddress" autoComplete="email" />
          <PrimaryButton title={t.sendCode} onPress={onForgot} busy={busy} disabled={!email.trim()} />
          <LinkButton title={t.cancel} onPress={() => go("signIn")} />
        </View>
      ) : step === "reset" ? (
        <View>
          <Field label={t.code} value={code} onChangeText={setCode} keyboard="number-pad" textContentType="oneTimeCode" maxLength={6} />
          <Field label={t.newPassword} value={password} onChangeText={setPassword} secure textContentType="newPassword" />
          <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text>
          <PrimaryButton title={t.continue} onPress={onReset} busy={busy} disabled={code.trim().length < 4 || password.length < 8} />
          <LinkButton title={t.cancel} onPress={() => go("signIn")} />
        </View>
      ) : (
        <View>
          {showApple ? (
            <View style={{ marginBottom: 16 }}>
              <AppleButton title={t.continueWithApple} onPress={onApple} busy={busy} />
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: KIT.line }} />
                <Text style={{ color: KIT.muted, fontSize: 13, marginHorizontal: 10 }}>{t.or}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: KIT.line }} />
              </View>
            </View>
          ) : null}
          <Field label={t.email} value={email} onChangeText={setEmail} keyboard="email-address" textContentType="emailAddress" autoComplete="email" />
          <Field
            label={t.password}
            value={password}
            onChangeText={setPassword}
            secure
            textContentType={step === "signUp" ? "newPassword" : "password"}
            autoComplete={step === "signUp" ? "new-password" : "current-password"}
          />
          {step === "signUp" ? <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text> : null}
          <PrimaryButton
            title={step === "signUp" ? t.signUp : t.signIn}
            onPress={step === "signUp" ? onSignUp : onSignIn}
            busy={busy}
            disabled={!email.trim() || password.length < (step === "signUp" ? 8 : 1)}
          />
          {step === "signIn" && PASSWORD_RESET_AVAILABLE ? <LinkButton title={t.forgot} onPress={() => go("forgot")} /> : null}
          <LinkButton title={step === "signUp" ? t.haveAccount : t.noAccount} onPress={() => go(step === "signUp" ? "signIn" : "signUp")} />
          {step === "signUp" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <Text style={{ color: KIT.muted, fontSize: 13 }}>{t.agree} </Text>
              <Pressable onPress={() => openTermsOfUse()} accessibilityRole="link" hitSlop={8}>
                <Text style={{ color: KIT.accent, fontSize: 13 }}>{t.terms}</Text>
              </Pressable>
              <Text style={{ color: KIT.muted, fontSize: 13 }}> and </Text>
              <Pressable onPress={() => openPrivacyPolicy()} accessibilityRole="link" hitSlop={8}>
                <Text style={{ color: KIT.accent, fontSize: 13 }}>{t.privacy}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** The same flow in a sheet, for a single control that needs an account. */
export function SignInSheet(props: {
  visible: boolean;
  onClose: () => void;
  reason?: string;
  mode?: "signIn" | "signUp";
  labels?: Partial<AccountKitLabels>;
}) {
  const t = labelsWith(props.labels);
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <ScrollView contentContainerStyle={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <SignInFlow reason={props.reason} mode={props.mode} labels={props.labels} onDone={props.onClose} />
        <View style={{ paddingHorizontal: 20, alignItems: "center" }}>
          <LinkButton title={t.cancel} onPress={props.onClose} />
        </View>
      </ScrollView>
    </Modal>
  );
}

/**
 * Sign-in in front of what genuinely needs an account, and nothing else.
 *
 * Signed out, it shows a short card where that data or control would be, and
 * the rest of the app keeps working - which is what Apple asks for in Guideline
 * 5.1.1(v): people use everything that does not need an account without one.
 */
export function RequireAccount(props: {
  reason?: string;
  children: React.ReactNode;
  labels?: Partial<AccountKitLabels>;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const session = useKitSession();
  const [open, setOpen] = useState(false);
  if (session.loading) return null;
  if (session.signedIn) return <>{props.children}</>;
  return (
    <View style={[{ flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }, props.style as never]}>
      <Text style={{ color: KIT.text, fontSize: 16, marginBottom: 12, textAlign: "center" }}>{props.reason ? t.signInPrompt + " " + props.reason : t.signInPrompt}</Text>
      <PrimaryButton title={t.signIn} onPress={() => setOpen(true)} />
      <SignInSheet visible={open} onClose={() => setOpen(false)} reason={props.reason} labels={props.labels} />
    </View>
  );
}

/**
 * The account screen: who is signed in, changing a password, signing out, and
 * deleting the account for real.
 *
 * Delete is two steps on purpose, and it says what is deleted before it asks
 * again. Apple requires it to be here, in the app, and to remove the account
 * itself rather than sign the person out (Guideline 5.1.1(v)).
 */
export function AccountPanel(props: {
  compact?: boolean;
  labels?: Partial<AccountKitLabels>;
  onDeleted?: () => void;
  onSignedOut?: () => void;
  style?: unknown;
}) {
  const t = labelsWith(props.labels);
  const session = useKitSession();
  const [stage, setStage] = useState<"idle" | "password" | "confirmDelete" | "deleted">("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Before the signed-out check: deleting the account signs this device out.
  if (stage === "deleted") {
    return (
      <View style={[{ padding: 20 }, props.style as never]}>
        <Text style={{ color: KIT.text, fontSize: 16 }}>{t.deleted}</Text>
      </View>
    );
  }
  if (session.loading) return null;
  if (!session.signedIn) {
    return (
      <View style={[{ padding: 20 }, props.style as never]}>
        <RequireAccount labels={props.labels} style={{ padding: 0 }}>
          <View />
        </RequireAccount>
      </View>
    );
  }

  const onChangePassword = async () => {
    setBusy(true);
    setError(null);
    const result = await updatePassword(next, current);
    setBusy(false);
    if (result.error === WRONG_CURRENT_PASSWORD) {
      // Nothing on the session tells an account made with Apple (whose
      // password only Borel holds) from a mistyped password, so this says
      // both, in place of a form that cannot succeed for the first.
      setCurrent("");
      setNext("");
      setStage("idle");
      setNote(t.wrongCurrentPassword);
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent("");
    setNext("");
    setStage("idle");
    setNote(t.changedPassword);
  };

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStage("deleted");
    if (props.onDeleted) props.onDeleted();
  };

  return (
    <View style={[{ padding: 20, borderTopWidth: props.compact ? 0 : 1, borderTopColor: KIT.line }, props.style as never]}>
      <Text style={{ color: KIT.muted, fontSize: 13 }}>{t.signedInAs}</Text>
      <Text style={{ color: KIT.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>{session.user && session.user.email ? session.user.email : ""}</Text>
      <Note text={note} />
      <Problem text={error} />

      {stage === "password" ? (
        <View style={{ marginBottom: 8 }}>
          <Field label={t.currentPassword} value={current} onChangeText={setCurrent} secure textContentType="password" />
          <Field label={t.newPassword} value={next} onChangeText={setNext} secure textContentType="newPassword" />
          <Text style={{ color: KIT.muted, fontSize: 13, marginBottom: 12 }}>{t.passwordRule}</Text>
          <PrimaryButton title={t.changePassword} onPress={onChangePassword} busy={busy} disabled={!current || next.length < 8} />
          <LinkButton title={t.cancel} onPress={() => setStage("idle")} />
        </View>
      ) : stage === "confirmDelete" ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: KIT.text, fontSize: 16, fontWeight: "600", marginBottom: 8 }}>{t.deleteTitle}</Text>
          <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 12 }}>{t.deleteBody}</Text>
          <Text style={{ color: KIT.muted, fontSize: 14, marginBottom: 6 }}>{t.deleteSubscription}</Text>
          <LinkButton title={t.manageSubscriptions} onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)} />
          <View style={{ height: 8 }} />
          <PrimaryButton title={t.deleteConfirm} onPress={onDelete} busy={busy} tone="danger" />
          <LinkButton title={t.cancel} onPress={() => setStage("idle")} />
        </View>
      ) : (
        <View>
          {IN_PREVIEW ? <Note text={t.previewPassword} /> : <LinkButton title={t.changePassword} onPress={() => setStage("password")} />}
          <LinkButton
            title={t.signOut}
            onPress={() => {
              void signOut();
              if (props.onSignedOut) props.onSignedOut();
            }}
          />
          <LinkButton title={t.deleteAccount} tone="danger" onPress={() => setStage("confirmDelete")} />
        </View>
      )}
    </View>
  );
}
