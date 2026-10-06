// Managed by Borel. This file is generated and kept in sync automatically.
// Editing it by hand will be overwritten the next time your backend changes.
//
// Everything about accounts: the current session, and the calls a login and
// account screen make (deleteAccount included). Import from here rather than calling db.auth directly - the
// results below are already translated into what a screen needs to show.
//
// Implementation lives in ./auth/ submodules; this file is the public connector.
export type { User, Session, AuthResult } from "./auth/types";
export { AUTH_REDIRECT_URL, PASSWORD_RESET_AVAILABLE } from "./auth/constants";
export { authErrorMessage } from "./auth/errors";
export type { AuthState, AuthContextValue } from "./auth/context";
export { AuthProvider, useAuth } from "./auth/context";
export type { AccountKitLabels } from "./auth/labels";
export type { SignInStep } from "./auth/SignInFlow";
export {
  signUp,
  signIn,
  signOut,
  sendPasswordReset,
  resetPassword,
  confirmEmail,
  updatePassword,
  resendConfirmation,
  deleteAccount,
} from "./auth/actions";
export { SignInFlow } from "./auth/SignInFlow";
export { SignInSheet } from "./auth/SignInSheet";
export { RequireAccount } from "./auth/RequireAccount";
export { AccountPanel } from "./auth/AccountPanel";
