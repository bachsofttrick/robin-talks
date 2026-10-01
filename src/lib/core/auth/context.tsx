import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { db } from "../db";
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
