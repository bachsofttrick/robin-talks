import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AUTH_URL, BACKEND_AUTH_URL, PREVIEW_AUTH_URL, DATA_API_URL, IN_BROWSER, borelHeaders } from "./config";
import { refusalOf, noteRefusal, CLOUD_NEUTRAL } from "./errors";
import { forgetModeration } from "./moderation-state";

type Session = { user: User } | null;
export interface User {
  id: string;
  email: string | null;
  name?: string | null;
  image?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Brokered preview session (browser only). The browser holds ONLY the opaque
// handle; the parent preview frame keeps it across reloads via postMessage.
// ---------------------------------------------------------------------------

const BROKERED_SESSION_STORAGE_KEY = "borel-brokered-auth-session";
let brokerToken: string | null = null;
let currentSession: Session = null;
type Listener = (session: Session) => void;
const listeners: Listener[] = [];

/** Ask the preview's parent frame for the handle it is holding for this app. Once. */
async function loadBrokerToken(): Promise<void> {
  brokerToken = await AsyncStorage.getItem(BROKERED_SESSION_STORAGE_KEY);
}

async function setBrokerToken(session: Session, token: string | null): Promise<void> {
  currentSession = session;
  forgetModeration();
  if (token)
    await AsyncStorage.setItem(BROKERED_SESSION_STORAGE_KEY, token);
  else
    await AsyncStorage.removeItem(BROKERED_SESSION_STORAGE_KEY);

  // Hand the new session to every auth-state subscriber from brokerAuth.onAuthStateChange
  for (const fn of listeners) {
    try {
      fn(session);
    } catch {
      // a screen's own handler throwing is not our problem
    }
  }
}

async function brokerFetch(path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const res = await fetch(PREVIEW_AUTH_URL + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...borelHeaders(),
        ...(brokerToken ? { Authorization: "Bearer " + brokerToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: { message: err instanceof Error ? err.message : "Network error." } };
  }
}

/**
 * brokerAuth is built for web version (preview session),
 * mimicking Supabase Auth functions and returns.
 * It does not save login session, and will be lost upon reload.
 */
export const brokerAuth = {
  async signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const r = await brokerFetch("/sign-up", {
      email: input.email,
      password: input.password,
      name: (input.options?.data?.name as string | undefined) ?? undefined,
    });
    if (!r.ok) return { data: { session: null, user: null }, error: { message: r.json?.error || "Could not sign up." } };
    const user: User | null = r.json?.user ?? null;
    if (r.json?.session) await setBrokerToken(user ? { user } : null, r.json.session);
    return { data: { session: r.json?.session && user ? { user } : null, user }, error: null };
  },
  async signInWithPassword(input: { email: string; password: string }) {
    const r = await brokerFetch("/sign-in", { email: input.email, password: input.password });
    if (!r.ok) return { data: { session: null }, error: { message: r.json?.error || "That email and password do not match." } };
    const user: User | null = r.json?.user ?? null;
    await setBrokerToken(user ? { user } : null, r.json?.session ?? null);
    return { data: { session: user ? { user } : null }, error: null };
  },
  async getSession() {
    await loadBrokerToken();
    if (!brokerToken) return { data: { session: null }, error: null };
    const r = await brokerFetch("/session");
    const user: User | null = r.ok ? (r.json?.user ?? null) : null;
    if (!user) {
      currentSession = null;
      return { data: { session: null }, error: null };
    }
    currentSession = { user };
    return { data: { session: { user } }, error: null };
  },
  onAuthStateChange(callback: (event: string, session: Session) => void) {
    const listener: Listener = (session) => callback(session ? "SIGNED_IN" : "SIGNED_OUT", session);
    listeners.push(listener);
    return {
      data: {
        subscription: {
          unsubscribe() {
            const i = listeners.indexOf(listener);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
      },
    };
  },
  async signOut() {
    await brokerFetch("/sign-out", {});
    await setBrokerToken(null, null);
    return { error: null };
  },
  async resetPasswordForEmail(email: string, _options?: { redirectTo?: string }) {
    const r = await brokerFetch("/reset", { email });
    return { error: r.ok ? null : { message: r.json?.error || "Could not send the reset email." } };
  },
  // Confirming a new account's code makes a session, and in the preview Borel
  // holds sessions, so the code goes through the broker like a sign-in does.
  async verifyOtp(input: { type: string; email: string; token: string }) {
    const r = await brokerFetch("/verify-email", { email: input.email, otp: input.token });
    if (!r.ok) return { data: { session: null, user: null }, error: { message: r.json?.error || "That code is wrong or has expired." } };
    const user: User | null = r.json?.user ?? null;
    if (r.json?.session) await setBrokerToken(user ? { user } : null, r.json.session);
    return { data: { session: r.json?.session && user ? { user } : null, user }, error: null };
  },
  async updateUser(_attributes: { password?: string }) {
    // A password change needs the live session, which lives on Borel in the
    // preview. Offer it where it works rather than failing opaquely.
    return { error: { message: "Changing your password isn't available in the preview. Try it on a device." } };
  },
  async resend(_input: { type: string; email: string; options?: unknown }) {
    return { error: null };
  },
  // Present so `currentSession` is not flagged as unused; screens read the user
  // from useAuth(), never from here.
  _current() {
    return currentSession;
  },
};

/**
 * One call to this app's sign-in service that needs no session: sending a
 * code, or resetting a password with one. On a phone that service is the
 * backend better-auth host; the browser preview keeps Borel's. `error` carries
 * the server's own words for core/auth to translate.
 */
const AUTH_CALL_URL = IN_BROWSER ? AUTH_URL : BACKEND_AUTH_URL;
export async function authCall(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; error: unknown }> {
  try {
    const res = await fetch(AUTH_CALL_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string; code?: string };
    if (res.ok) return { ok: true, status: res.status, error: null };
    return { ok: false, status: res.status, error: { message: json.message || json.error || json.code || "Request failed (" + res.status + ")." } };
  } catch (err) {
    return { ok: false, status: 0, error: { message: err instanceof Error ? err.message : "network error" } };
  }
}

// ---------------------------------------------------------------------------
// Staying signed in on a phone
//
// The sign-in session is a cookie. On a phone this file keeps it: every auth
// response's Set-Cookie is remembered, written to device storage under this
// app's own key, and sent back as a Cookie header on the next auth call, with
// the platform cookie jar switched off for these calls. So a restart finds the
// session where sign-in left it, and signing out removes it. Only auth calls
// carry it; database calls use the short-lived token the session is exchanged
// for, as before.
// ---------------------------------------------------------------------------
const SESSION_STORAGE_KEY = "backend-auth-session:" + BACKEND_AUTH_URL;
type StoredCookie = { value: string; expires: number | null };
let sessionCookies: Record<string, StoredCookie> = {};
let sessionLoad: Promise<void> | null = null;

function loadSessionCookies(): Promise<void> {
  if (!sessionLoad) {
    sessionLoad = AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") sessionCookies = parsed;
      })
      .catch(() => {
        // Unreadable storage means signed out, never a crash.
      });
  }
  return sessionLoad;
}

function saveSessionCookies(): void {
  const write = Object.keys(sessionCookies).length
    ? AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionCookies))
    : AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  write.catch(() => {
    // The session still works for this launch; it just won't survive a restart.
  });
}

// A joined Set-Cookie header splits on a comma only where a new name=value
// starts, since an Expires date carries a comma of its own.
function splitSetCookie(header: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < header.length; i++) {
    if (header[i] !== ",") continue;
    const rest = header.slice(i + 1).trimStart();
    const eq = rest.indexOf("=");
    const semi = rest.indexOf(";");
    const space = rest.indexOf(" ");
    if (eq > 0 && (semi === -1 || eq < semi) && (space === -1 || eq < space)) {
      parts.push(header.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(header.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function rememberCookies(lines: string[]): boolean {
  const now = Date.now();
  let changed = false;
  for (const line of lines) {
    const segments = line.split(";");
    const pair = segments[0] || "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    let maxAge: number | null = null;
    let expiresAt: number | null = null;
    for (const segment of segments.slice(1)) {
      const at = segment.indexOf("=");
      const key = (at === -1 ? segment : segment.slice(0, at)).trim().toLowerCase();
      const attr = at === -1 ? "" : segment.slice(at + 1).trim();
      if (key === "max-age" && attr !== "" && Number.isFinite(Number(attr))) maxAge = Number(attr);
      if (key === "expires") {
        const t = Date.parse(attr);
        if (!Number.isNaN(t)) expiresAt = t;
      }
    }
    const expires = maxAge !== null ? now + maxAge * 1000 : expiresAt;
    if (value === "" || (expires !== null && expires <= now)) {
      if (sessionCookies[name]) {
        delete sessionCookies[name];
        changed = true;
      }
    } else {
      sessionCookies[name] = { value, expires };
      changed = true;
    }
  }
  return changed;
}

/**
 * Every unexpired cookie the jar holds, as one `name=value; ...` header. The
 * jar load is awaited here so a data request on a cold start still carries the
 * session cookie.
 */
export async function sessionCookieHeader(): Promise<string> {
  await loadSessionCookies();
  const now = Date.now();
  return Object.entries(sessionCookies)
    .filter(([, c]) => c.expires === null || c.expires > now)
    .map(([name, c]) => name + "=" + c.value)
    .join("; ");
}

const sessionPlugin = {
  id: "borel-session",
  name: "borel-session",
  hooks: {
    async onRequest(context: any) {
      const headers = new Headers(context.headers || {});
      const cookie = await sessionCookieHeader();
      if (cookie) headers.set("cookie", cookie);
      else headers.delete("cookie");
      return { ...context, headers, credentials: "omit" };
    },
    async onResponse(context: any) {
      const response = context.response;
      if (!response || !response.headers) return;
      const lines: string[] =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : splitSetCookie(response.headers.get("set-cookie") || "");
      let changed = rememberCookies(lines);
      const url = String((context.request && context.request.url) || "");
      if (response.ok && url.includes("/sign-out") && Object.keys(sessionCookies).length) {
        sessionCookies = {};
        changed = true;
      }
      if (changed) saveSessionCookies();
    },
  },
};

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

// Every Data API request goes through here. A refusal from Borel (402 with a
// reason) is turned into the body the PostgREST client builds its error from,
// so error.message is a neutral sentence and error.code is the reason, and the
// owner is told once. Every other answer passes through untouched.
async function dataFetch(input: any, init?: any): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 402) return res;
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not a refusal Borel wrote
  }
  const reason = refusalOf(402, json);
  if (!reason) return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  noteRefusal(reason, "cloud");
  return new Response(JSON.stringify({ message: CLOUD_NEUTRAL[reason], code: reason, details: null, hint: null }), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}

let nativeClient: any = null;
export function native(): any {
  if (!nativeClient) {
    nativeClient = createClient({
      auth: { url: BACKEND_AUTH_URL, adapter: SupabaseAuthAdapter({ fetchOptions: { plugins: [sessionPlugin] } }), allowAnonymous: true },
      dataApi: { url: DATA_API_URL, options: { global: { fetch: dataFetch } } },
    });
  }
  return nativeClient;
}

// In the browser the Data API client runs in external-provider mode: it asks
// getToken() for the value to send, which is the app-scoped handle (or the
// signed-out marker). Borel swaps that for a real RLS JWT server-side, so the
// browser never holds one.
export const client: any = IN_BROWSER
  ? createClient({
      dataApi: {
        url: DATA_API_URL,
        getToken: async () => {
          await loadBrokerToken();
          return brokerToken ?? "bps_anon";
        },
        options: { global: { fetch: dataFetch } },
      },
    })
  : native();

/** The bearer storage should send: the handle in the preview, the session JWT on a device. */
export async function authHeader(): Promise<string> {
  if (IN_BROWSER) {
    await loadBrokerToken();
    return brokerToken ?? "bps_anon";
  }
  try {
    const { data } = await native().auth.getSession();
    return data.session ? data.session.access_token : "";
  } catch {
    return "";
  }
}

type AuthCallback = (event: string, session: any) => void;
const phoneSubscribers: AuthCallback[] = [];

/**
 * Tell every subscribed screen who is signed in, on a phone.
 *
 * The sign-in adapter reports the session once, when a screen subscribes, and
 * never again: a sign-in, a confirmed code or a sign-out in this same app
 * reached no screen until it was mounted again, so a Sign in button could look
 * like it did nothing. So this file tells every subscriber itself, after each
 * call that changes who is signed in. The preview's broker already tells its
 * own listeners.
 */
export async function tellScreens(): Promise<void> {
  if (IN_BROWSER) return;
  forgetModeration();
  let session: any = null;
  try {
    const { data } = await native().auth.getSession({ forceFetch: true });
    session = data && data.session ? data.session : null;
  } catch {
    session = null;
  }
  for (const fn of phoneSubscribers.slice()) {
    try {
      fn(session ? "SIGNED_IN" : "SIGNED_OUT", session);
    } catch {
      // a screen's own handler throwing is not our problem
    }
  }
}

function announceSessionChanges(): void {
  if (IN_BROWSER) return;
  try {
    const auth: any = native().auth;
    for (const name of ["signInWithPassword", "signUp", "verifyOtp", "signOut"]) {
      if (!auth || typeof auth[name] !== "function") continue;
      const original = auth[name].bind(auth);
      auth[name] = async (...args: any[]) => {
        const result = await original(...args);
        await tellScreens();
        return result;
      };
    }
    if (auth && typeof auth.onAuthStateChange === "function") {
      const subscribe = auth.onAuthStateChange.bind(auth);
      auth.onAuthStateChange = (callback: AuthCallback) => {
        phoneSubscribers.push(callback);
        const inner = subscribe(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const i = phoneSubscribers.indexOf(callback);
                if (i >= 0) phoneSubscribers.splice(i, 1);
                try {
                  if (inner && inner.data && inner.data.subscription) inner.data.subscription.unsubscribe();
                } catch {
                  // already gone
                }
              },
            },
          },
        };
      };
    }
  } catch {
    // An auth client that cannot be watched still signs in and out as before.
  }
}
announceSessionChanges();
