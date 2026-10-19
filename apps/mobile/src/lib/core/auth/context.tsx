import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { db } from "../db";
import { sessionCookieHeader } from "../db/auth";
import type { User, Session } from "./types";
import { syncProfile, signUp, signIn, signOut, sendPasswordReset, updatePassword, resendConfirmation, deleteAccount, confirmEmail, resetPassword } from "./actions";

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
const SESSION_RETRY_DELAYS_MS = [500, 1500];

// Shared by the provider and standalone account UI; enabled prevents duplicate subscriptions.
function useSessionState(enabled: boolean): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, user: null, signedIn: false });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // A newer lookup or auth event invalidates results from earlier async work.
    let revision = 0;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = (session: Session | null) => {
      if (!active) return;
      const user = session ? (session.user as User) : null;
      setState({ loading: false, session, user, signedIn: Boolean(session) });
      if (user) syncProfile(user);
    };

    const restoreSession = async () => {
      const requestRevision = ++revision;
      clearTimeout(retryTimer);
      try {
        const cookieHeader = await sessionCookieHeader();
        if (!active || requestRevision !== revision) return;
        if (cookieHeader.length === 0) {
          retryCount = 0;
          apply(null);
          return;
        }
        // Read the backend directly instead of reusing SDK cache or another in-flight lookup.
        const { data, error } = await db.auth.getSession({ forceFetch: true });
        if (!active || requestRevision !== revision) return;
        if (error) throw error;
        retryCount = 0;
        apply((data?.session as Session | null) ?? null);
      } catch {
        if (!active || requestRevision !== revision) return;
        // Keep startup loading through retries instead of treating a failed lookup as sign-out.
        const delay = SESSION_RETRY_DELAYS_MS[retryCount++];
        if (delay !== undefined) {
          retryTimer = setTimeout(() => void restoreSession(), delay);
        } else {
          // Exhausted retries release the splash while preserving any established session.
          setState((previous) => ({ ...previous, loading: false }));
        }
      }
    };

    const { data } = db.auth.onAuthStateChange((event: string, session: unknown) => {
      // The adapter starts its own initial lookup, whose stale result could overwrite ours.
      if (event === "INITIAL_SESSION") return;
      // Live auth events take priority over pending restoration and scheduled retries.
      revision++;
      retryCount = 0;
      clearTimeout(retryTimer);
      apply((session as Session | null) ?? null);
    });
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      // Recover from an earlier failed lookup when the user returns to the app.
      retryCount = 0;
      void restoreSession();
    });
    void restoreSession();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      data.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [enabled]);

  return state;
}

/**
 * Wrap the app in this once, at the root, above the navigator.
 *
 * `loading` is the part worth respecting: on launch the stored session is read
 * asynchronously, and an app that renders its login screen during that gap
 * flashes it at every already-signed-in user, every single launch.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSessionState(true);

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

/**
 * The session, with or without a provider above.
 *
 * The kit is in every app that has this file, including apps that never mount
 * <AuthProvider> because they only use the database. The app-facing hook above
 * throws when there is no provider, so this one reads the context when there is
 * one and subscribes on its own when there is not - same hooks either way.
 */
export function useKitSession(): AuthState {
  const fromProvider = useContext(AuthContext);
  const own = useSessionState(fromProvider === null);

  return fromProvider ?? own;
}
