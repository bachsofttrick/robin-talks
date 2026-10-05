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
