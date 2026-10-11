import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { BACKEND_AUTH_URL, BACKEND_DATA_URL, IN_BROWSER } from "./config";
import { forgetModeration } from "./moderation-state";

type AuthCallback = (event: string, session: any) => void;

const listeners = new Set<AuthCallback>();

export function createBrowserAuth(auth: any) {
  async function notify(): Promise<void> {
    forgetModeration();
    let session: any = null;
    try {
      const r = await auth.getSession({ forceFetch: true });
      session = r?.data?.session ?? null;
    } catch {
      session = null;
    }
    for (const listener of listeners) {
      try {
        listener(session ? "SIGNED_IN" : "SIGNED_OUT", session);
      } catch {
        // a screen's own handler throwing is not our problem
      }
    }
  }

  return {
    signUp(input: any) {
      return auth.signUp(input);
    },
    async signInWithPassword(input: any) {
      const result = await auth.signInWithPassword(input);
      await notify();
      return result;
    },
    async verifyOtp(input: any) {
      const result = await auth.verifyOtp(input);
      await notify();
      return result;
    },
    getSession(options?: any) {
      return auth.getSession(options);
    },
    async signOut() {
      const result = await auth.signOut();
      await notify();
      return result;
    },
    onAuthStateChange(callback: AuthCallback) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },
    getBetterAuthInstance() {
      return auth.getBetterAuthInstance?.();
    },
    notify,
  };
}

type BrokerAuth = ReturnType<typeof createBrowserAuth>;

// Build the brokered client only in the browser. On a phone the auth provider's
// useSession subscribe would otherwise fire a stray unauthenticated
// /get-session at every launch, and nothing on native reads brokerAuth (db.ts
// picks native().auth off IN_BROWSER).
const browserClient: any = IN_BROWSER
  ? createClient({
      auth: { url: BACKEND_AUTH_URL, adapter: SupabaseAuthAdapter() },
      dataApi: { url: BACKEND_DATA_URL },
    })
  : null;

// Same shape as the real broker, so the re-export from auth.ts stays type-safe
// in strict mode without touching the network on a device.
const nativeBrokerAuth: BrokerAuth = {
  signUp: async () => ({ data: { session: null }, error: null }),
  signInWithPassword: async () => ({ data: { session: null }, error: null }),
  verifyOtp: async () => ({ data: { session: null }, error: null }),
  getSession: async () => ({ data: { session: null }, error: null }),
  signOut: async () => ({ error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  getBetterAuthInstance: () => undefined,
  notify: async () => {},
};

export const brokerAuth: BrokerAuth = IN_BROWSER ? createBrowserAuth(browserClient.auth) : nativeBrokerAuth;
