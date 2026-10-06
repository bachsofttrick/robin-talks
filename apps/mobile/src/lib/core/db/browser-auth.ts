import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { BACKEND_AUTH_URL, backendDataUrl } from "./config";
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

const browserClient: any = createClient({
  auth: { url: BACKEND_AUTH_URL, adapter: SupabaseAuthAdapter() },
  dataApi: { url: backendDataUrl() },
});

export const brokerAuth = createBrowserAuth(browserClient.auth);
