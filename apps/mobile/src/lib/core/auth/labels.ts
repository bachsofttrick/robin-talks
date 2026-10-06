import { WRONG_CURRENT_PASSWORD } from "./constants";

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
}

export const LABELS: AccountKitLabels = {
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
};

export function labelsWith(custom?: Partial<AccountKitLabels>): AccountKitLabels {
  return custom ? { ...LABELS, ...custom } : LABELS;
}
