// Managed by Borel. This file is generated and kept in sync automatically.
// Editing it by hand will be overwritten the next time your backend changes.
//
// Your app's own cloud: a Postgres database, sign-in, file storage and AI, all
// reached through this app's own address on Borel. Nothing in this file is a
// secret and there is no server anywhere in it: Borel forwards each call to the
// cloud with the right credentials, so the same code works on a phone and in
// the in-browser preview. Every row you can read or write is still decided by
// your tables' row-level security policies, using the signed-in user's own token.
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const DATA_API_URL = process.env.EXPO_PUBLIC_DATA_API_URL ?? "";
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? "";
export const PREVIEW_AUTH_URL = process.env.EXPO_PUBLIC_PREVIEW_AUTH_URL ?? "";
export const BOREL_STORAGE = process.env.EXPO_PUBLIC_BOREL_STORAGE ?? "";
export const BOREL_AI = process.env.EXPO_PUBLIC_BOREL_AI ?? "";
export const BOREL_ACCOUNT = process.env.EXPO_PUBLIC_BOREL_ACCOUNT ?? "";
export const BOREL_APPLE = process.env.EXPO_PUBLIC_BOREL_APPLE ?? "";
export const BOREL_USAGE_URL = process.env.EXPO_PUBLIC_BOREL_USAGE_URL ?? "";
export const BOREL_INVITE_URL = process.env.EXPO_PUBLIC_BOREL_INVITE_URL ?? "";

/**
 * The link to share for one of this app's invite codes (a group's join code,
 * an event's RSVP code): pass it to shareContent({ message, url }). On a phone
 * with this app it opens the app, which receives the code through
 * useIncomingLink() from borel-systemui; everywhere else it opens a page that
 * offers the app and shows the code to type in.
 */
export function createInviteLink(code: string): string {
  return BOREL_INVITE_URL + "/" + encodeURIComponent(String(code == null ? "" : code).trim());
}

// The in-browser preview is Expo running on the web, in a sandbox; a phone or a
// published build is native, where there is no `document`. Only the browser
// preview uses Borel's brokered session; native keeps its own, exactly as a
// shipped app does.
const IN_BROWSER = typeof document !== "undefined";

// ---------------------------------------------------------------------------
// Which surface this is. It decides only what a refusal SAYS: the owner in the
// preview or Expo Go is told to add balance; a person using the store build is
// told the feature is unavailable and nothing more. The store build carries a
// stamp in its config that Borel minted for it; Expo Go and the preview never
// do. Same rule as Borel's analytics module: Expo Go is detected explicitly.
// ---------------------------------------------------------------------------
const RUNTIME = (Constants && Constants.expoConfig && Constants.expoConfig.extra && (Constants.expoConfig.extra as any).borelRuntime) || null;
const IS_DEV_SURFACE =
  Boolean((globalThis as any).__DEV__) ||
  (Constants && (Constants as any).appOwnership === "expo") ||
  (Constants && (Constants as any).executionEnvironment === "storeClient");
const SURFACE: "preview" | "dev" | "release" = IN_BROWSER
  ? "preview"
  : IS_DEV_SURFACE
    ? "dev"
    : RUNTIME && RUNTIME.surface === "release"
      ? "release"
      : "dev";
const BUILD_STAMP: string | null = SURFACE === "release" && RUNTIME && typeof RUNTIME.buildStamp === "string" ? RUNTIME.buildStamp : null;

/** Sent on every call to Borel, so a refusal can be worded for whoever is reading. */
function borelHeaders(): Record<string, string> {
  return { "X-Borel-Surface": SURFACE, ...(BUILD_STAMP ? { "X-Borel-Build": BUILD_STAMP } : {}) };
}

// Why Borel refused a call, when it did. Anything else is a plain failure.
export type AiRefusal = "wallet_empty" | "daily_allowance_used" | "cloud_paused";

// What the app shows for a refusal, on EVERY surface: nothing about money, so
// a person using the released app never reads the owner's billing state. The
// owner is told through Borel itself (the preview, Expo Go, the Usage tab).
const NEUTRAL_ERROR: Record<AiRefusal, string> = {
  wallet_empty: "AI isn't available right now, so please try again later.",
  daily_allowance_used: "AI has reached today's limit, so it's back tomorrow.",
  cloud_paused: "This isn't available right now, so please try again later.",
};

// The same for the database and files. At zero the whole cloud stops, and an
// app with no AI must not say "AI".
const CLOUD_NEUTRAL: Record<AiRefusal, string> = {
  wallet_empty: "This isn't available right now, so please try again later.",
  daily_allowance_used: "This isn't available right now, so please try again later.",
  cloud_paused: "This isn't available right now, so please try again later.",
};

// ---------------------------------------------------------------------------
// Every error this file hands a screen is ONE plain sentence a person can read.
// The technical words (a status, a provider's message, a network exception)
// go in `detail` or `raw`, never in `error`. A sentence Borel itself wrote
// for the person is kept; anything that reads like code or like a provider's
// account text is replaced with the sentence for that kind of failure.
// ---------------------------------------------------------------------------
const CODE_CHARACTERS = '"{}<>[]/@_=;|#$%^*~+';
const TECHNICAL_WORDS = new Set([
  "json", "api", "apis", "null", "undefined", "token", "tokens", "http", "https", "url", "urls", "quota", "billing",
  "schema", "sql", "server", "endpoint", "payload", "gateway", "status", "model", "models", "exception", "stack",
  "parse", "invalid", "upstream", "error", "errors", "code", "org", "id", "rls", "postgres", "postgrest", "policy",
]);

function looksPlain(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const s = text.trim();
  if (s.length < 8 || s.length > 120) return false;
  const first = s.charCodeAt(0);
  if (first < 65 || first > 90) return false;
  const last = s[s.length - 1];
  if (last !== "." && last !== "!" && last !== "?") return false;
  let word = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    // A line break, a backslash or a backtick is never in a sentence for a person.
    if (code === 10 || code === 13 || code === 92 || code === 96) return false;
    if (CODE_CHARACTERS.indexOf(c) !== -1) return false;
    // One sentence: nothing ends and then carries on.
    if ((c === "." || c === "!" || c === "?") && i < s.length - 1) return false;
    const lower = code >= 97 && code <= 122;
    const upper = code >= 65 && code <= 90;
    // camelCase is code.
    if (upper && i > 0 && s.charCodeAt(i - 1) >= 97 && s.charCodeAt(i - 1) <= 122) return false;
    if (lower || upper) {
      word += c.toLowerCase();
    } else {
      if (TECHNICAL_WORDS.has(word)) return false;
      word = "";
    }
  }
  return !TECHNICAL_WORDS.has(word);
}

/** The words an error body carries, wherever the sender put them. */
function messageOf(json: any): string | null {
  if (!json || typeof json !== "object") return null;
  if (typeof json.error === "string") return json.error;
  if (json.error && typeof json.error.message === "string") return json.error.message;
  return typeof json.message === "string" ? json.message : null;
}

const DATA_SAYS = {
  save: "That didn't save, so check your connection and try again.",
  load: "Couldn't load this right now, so please try again.",
};

/**
 * The sentence to show for a failed db.from() call, never error.message
 * (that is database text, such as a row-level security violation). Pass
 * "save" for an insert, update, upsert or delete, and "load" for a select.
 * Null when there is no error.
 */
export function plainError(error: unknown, action: "save" | "load" = "save"): string | null {
  if (!error) return null;
  const e = typeof error === "object" ? (error as { code?: unknown; reason?: unknown }) : {};
  const code = typeof e.code === "string" ? e.code : typeof e.reason === "string" ? e.reason : "";
  if (code === "wallet_empty" || code === "daily_allowance_used" || code === "cloud_paused") return CLOUD_NEUTRAL[code];
  return action === "load" ? DATA_SAYS.load : DATA_SAYS.save;
}

// ---------------------------------------------------------------------------
// Asking before anything goes to AI. App Store Review Guideline 5.1.2(i): an
// app must "clearly disclose where personal data will be shared with third
// parties, including with third-party AI, and obtain explicit permission
// before doing so". Apple rejects an app that sends what someone types or a
// photo they chose to an AI company without saying what goes where and asking
// first, so every db.ai call asks here, once per company, before it sends.
// "Allow" is remembered on this device; "Don't Allow" is not, so the next use
// asks again. Nothing is sent without it.
// ---------------------------------------------------------------------------
const AI_CONSENT_KEY = "borel.aiConsent.v1:";
const AI_MAKERS: Record<string, string> = {"qwen3-next-80b-a3b-instruct":"Qwen by Alibaba","gpt-oss-120b":"gpt-oss by OpenAI","gpt-oss-20b":"gpt-oss by OpenAI","llama-4-maverick":"Llama by Meta","gemini-3-flash":"Gemini by Google","claude-sonnet-5":"Claude by Anthropic","claude-haiku-4-5":"Claude by Anthropic","gpt-5-mini":"GPT-5 by OpenAI","gpt-5-nano":"GPT-5 by OpenAI"};
// The one model that hears a recording (Borel sends every recording to it).
const AI_AUDIO_MODEL = "gemini-3-flash";
const AI_DECLINED = "This feature shares what you send with AI, so it needs your permission. Use it again and tap Allow to turn it on.";
const aiConsentGiven = new Set<string>();
const aiConsentAsking = new Map<string, Promise<boolean>>();

type AiConsentKind = "chat" | "photoChat" | "audio" | "image" | "editImage";

function aiConsentWording(kind: AiConsentKind, model: string): { key: string; message: string } {
  if (kind === "audio") {
    // A voice is its own kind of personal data, so it is asked about on its own.
    const maker = AI_MAKERS[AI_AUDIO_MODEL] || "an AI model";
    return {
      key: "neon:audio:" + maker,
      message: "To answer, this app sends your recording to Neon, which runs " + maker + ". They use it only to create the answer.",
    };
  }
  if (kind === "chat") {
    const maker = AI_MAKERS[model] || AI_MAKERS[ai.models.fast] || "an AI model";
    return {
      key: "neon:" + maker,
      message: "To answer, this app sends what you type to Neon, which runs " + maker + ". They use it only to create the answer.",
    };
  }
  if (kind === "photoChat") {
    return {
      key: "openai:chat",
      message: "To answer, this app sends what you type and the photos you add to OpenAI. OpenAI uses them only to create the answer.",
    };
  }
  if (kind === "image") {
    return {
      key: "openai:image",
      message: "To make the picture, this app sends your description to OpenAI. OpenAI uses it only to create the picture.",
    };
  }
  return {
    key: "openai:edit",
    message: "To change the picture, this app sends the photo and your instructions to OpenAI. OpenAI uses them only to create the new picture.",
  };
}

async function askAiConsent(kind: AiConsentKind, model: string): Promise<boolean> {
  const { key, message } = aiConsentWording(kind, model);
  if (aiConsentGiven.has(key)) return true;
  const asking = aiConsentAsking.get(key);
  if (asking) return asking;
  const pending = (async () => {
    try {
      if ((await AsyncStorage.getItem(AI_CONSENT_KEY + key)) === "yes") {
        aiConsentGiven.add(key);
        return true;
      }
    } catch {
      // Storage unavailable (the preview's sandbox): ask instead.
    }
    const allowed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert(
        "Share with AI?",
        message + " Nothing is sent unless you allow it.",
        [
          { text: "Don't Allow", style: "cancel", onPress: () => settle(false) },
          { text: "Allow", onPress: () => settle(true) },
        ],
        { cancelable: true, onDismiss: () => settle(false) },
      );
    });
    if (allowed) {
      aiConsentGiven.add(key);
      try {
        await AsyncStorage.setItem(AI_CONSENT_KEY + key, "yes");
      } catch {
        // Remembered for this session only.
      }
    }
    return allowed;
  })();
  aiConsentAsking.set(key, pending);
  try {
    return await pending;
  } finally {
    aiConsentAsking.delete(key);
  }
}

function refusalOf(status: number, json: any): AiRefusal | null {
  const reason = json && typeof json.reason === "string" ? json.reason : null;
  if (reason === "wallet_empty" || reason === "daily_allowance_used" || reason === "cloud_paused") return reason;
  if (status !== 402) return null;
  // An older server says it in a sentence only.
  const text = json && typeof json.error === "string" ? json.error : "";
  if (/cloud is paused/i.test(text)) return "cloud_paused";
  if (/AI allowance/i.test(text)) return "daily_allowance_used";
  if (/AI is paused/i.test(text)) return "wallet_empty";
  return null;
}

const NOTICE_TITLE: Record<AiRefusal, string> = {
  wallet_empty: "Add AI balance in Borel",
  daily_allowance_used: "Today's AI allowance is used up",
  cloud_paused: "Your app's cloud is paused in Borel",
};
const NOTICE_BODY: Record<AiRefusal, string> = {
  wallet_empty: "This app's AI is paused because your Borel balance is empty. Add funds under Tools > Usage and it picks up right away.",
  daily_allowance_used: "It resets at midnight UTC, and grows when you add balance under Tools > Usage in Borel.",
  cloud_paused: "Add funds under Tools > Usage in Borel to bring it back exactly as it was.",
};
// A refused database or file call: the whole cloud is paused, not only AI.
const CLOUD_NOTICE_TITLE: Record<AiRefusal, string> = { ...NOTICE_TITLE, wallet_empty: "Your app's cloud is paused in Borel" };
const CLOUD_NOTICE_BODY: Record<AiRefusal, string> = {
  ...NOTICE_BODY,
  wallet_empty: "This app's database, files and AI are paused because your Borel balance is empty. Add funds under Tools > Usage and they pick up right away.",
};
const noticed = new Set<string>();

// Tell the owner, where the owner is: the preview host gets a hint on the
// app's own channel (untrusted; it only re-reads the wallet), Expo Go gets one
// native alert per reason per session. A store build gets nothing.
function noteRefusal(reason: AiRefusal, kind: "ai" | "cloud" = "ai"): void {
  if (IN_BROWSER) {
    postToParent({ type: "proxy-refusal", reason });
    return;
  }
  if (SURFACE !== "dev" || noticed.has(reason)) return;
  noticed.add(reason);
  const title = kind === "cloud" ? CLOUD_NOTICE_TITLE : NOTICE_TITLE;
  const body = kind === "cloud" ? CLOUD_NOTICE_BODY : NOTICE_BODY;
  try {
    Alert.alert(title[reason], body[reason], [
      { text: "Not now", style: "cancel" },
      {
        text: "Open Borel",
        onPress: () => {
          Linking.openURL(BOREL_USAGE_URL).catch(() => {});
        },
      },
    ]);
  } catch {
    // no alert on this surface
  }
}

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

let brokerToken: string | null = null;
let brokerLoaded = false;
let currentSession: Session = null;
type Listener = (session: Session) => void;
const listeners: Listener[] = [];

function postToParent(message: Record<string, unknown>): void {
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "borel-app", ...message }, "*");
    }
  } catch {
    // no parent to tell
  }
}

/** Ask the preview's parent frame for the handle it is holding for this app. Once. */
function loadBrokerToken(): Promise<string | null> {
  if (brokerLoaded) return Promise.resolve(brokerToken);
  brokerLoaded = true;
  return new Promise<string | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      brokerToken = value;
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event && (event.data as { source?: string; type?: string; bps?: unknown });
      if (data && data.source === "borel-preview" && data.type === "preview-session") {
        finish(typeof data.bps === "string" ? data.bps : null);
      }
    };
    window.addEventListener("message", onMessage);
    postToParent({ type: "preview-session:get" });
    // The preview may not answer (opened directly, no parent); don't hang.
    setTimeout(() => finish(null), 600);
  });
}

function setSession(session: Session, token: string | null): void {
  currentSession = session;
  brokerToken = token;
  brokerLoaded = true;
  forgetModeration();
  postToParent({ type: "preview-session:set", bps: token });
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

const brokerAuth = {
  async signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const r = await brokerFetch("/sign-up", {
      email: input.email,
      password: input.password,
      name: (input.options?.data?.name as string | undefined) ?? undefined,
    });
    if (!r.ok) return { data: { session: null, user: null }, error: { message: r.json?.error || "Could not sign up." } };
    const user: User | null = r.json?.user ?? null;
    if (r.json?.session) setSession(user ? { user } : null, r.json.session);
    return { data: { session: r.json?.session && user ? { user } : null, user }, error: null };
  },
  async signInWithPassword(input: { email: string; password: string }) {
    const r = await brokerFetch("/sign-in", { email: input.email, password: input.password });
    if (!r.ok) return { data: { session: null }, error: { message: r.json?.error || "That email and password do not match." } };
    const user: User | null = r.json?.user ?? null;
    setSession(user ? { user } : null, r.json?.session ?? null);
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
    setSession(null, null);
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
    if (r.json?.session) setSession(user ? { user } : null, r.json.session);
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
 * code, or resetting a password with one. Same address on a phone and in the
 * preview, since Borel forwards it with the trusted origin either way. `error`
 * carries the server's own words for core/auth to translate.
 */
export async function authCall(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; error: unknown }> {
  try {
    const res = await fetch(AUTH_URL + path, {
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
const SESSION_STORAGE_KEY = "borel-auth-session:" + AUTH_URL;
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

function sessionCookieHeader(): string {
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
      await loadSessionCookies();
      const headers = new Headers(context.headers || {});
      const cookie = sessionCookieHeader();
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
function native(): any {
  if (!nativeClient) {
    nativeClient = createClient({
      auth: { url: AUTH_URL, adapter: SupabaseAuthAdapter({ fetchOptions: { plugins: [sessionPlugin] } }), allowAnonymous: true },
      dataApi: { url: DATA_API_URL, options: { global: { fetch: dataFetch } } },
    });
  }
  return nativeClient;
}

// In the browser the Data API client runs in external-provider mode: it asks
// getToken() for the value to send, which is the app-scoped handle (or the
// signed-out marker). Borel swaps that for a real RLS JWT server-side, so the
// browser never holds one.
const client: any = IN_BROWSER
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
async function authHeader(): Promise<string> {
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

type StorageResult<T> = { data: T; error: null } | { data: null; error: { message: string; detail?: string } };

const FILES_SAY = {
  save: "That file couldn't be saved, so please try again.",
  read: "That file couldn't be read, so try picking it again.",
  open: "That file couldn't be opened right now, so please try again.",
  remove: "That file couldn't be deleted right now, so please try again.",
  offline: "Couldn't reach this app's files, so check your connection and try again.",
  tooBig: "That file is too big to upload, so choose a smaller one.",
};

// The most one file may be (lib/cloudStorage.ts on Borel's side): a video may
// be far bigger than anything else, and the app's total storage still applies.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

async function storageCall<T>(action: string, body: unknown, failed: string = FILES_SAY.save): Promise<StorageResult<T>> {
  try {
    const bearer = await authHeader();
    const res = await fetch(BOREL_STORAGE + "/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), ...(bearer ? { Authorization: "Bearer " + bearer } : {}) },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const reason = refusalOf(res.status, json);
      if (reason) {
        noteRefusal(reason, "cloud");
        return { data: null, error: { message: CLOUD_NEUTRAL[reason] } };
      }
      const said = messageOf(json);
      return { data: null, error: { message: looksPlain(said) ? said.trim() : failed, detail: said || "status " + res.status } };
    }
    return { data: json as T, error: null };
  } catch (err) {
    return { data: null, error: { message: FILES_SAY.offline, detail: err instanceof Error ? err.message : undefined } };
  }
}

/** A Blob, a data: or file:// URI, the asset object pickImage() returns, or a video from ./borel-video. */
export type Uploadable = Blob | string | { uri: string; type?: string; mimeType?: string };

async function toBlob(file: Uploadable): Promise<Blob> {
  if (typeof Blob !== "undefined" && file instanceof Blob) return file;
  // A video picked in the preview carries the picked File itself.
  const picked = typeof file === "object" ? (file as { file?: unknown }).file : undefined;
  if (typeof Blob !== "undefined" && picked instanceof Blob) return picked;
  const uri = typeof file === "string" ? file : (file as { uri: string }).uri;
  const res = await fetch(uri);
  return await res.blob();
}

function contentTypeOf(file: Uploadable, blob: Blob): string {
  if (typeof file === "object" && !(typeof Blob !== "undefined" && file instanceof Blob)) {
    const declared = (file as { mimeType?: string; type?: string }).mimeType || (file as { type?: string }).type;
    if (declared) return declared;
  }
  if (blob.type) return blob.type;
  if (typeof file === "string" && file.startsWith("data:")) {
    const match = /^data:([^;,]+)/.exec(file);
    if (match) return match[1];
  }
  return "application/octet-stream";
}

/**
 * The bytes to the presigned URL. With `onProgress` it goes through
 * XMLHttpRequest, the one request on a phone and in a browser that reports how
 * much of the body has been sent; fetch cannot.
 */
function putBytes(url: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<number> {
  if (!onProgress || typeof XMLHttpRequest === "undefined") {
    return fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob }).then((res) => res.status);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(0.99, event.loaded / event.total));
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("the upload was interrupted"));
    xhr.onabort = () => reject(new Error("the upload was stopped"));
    xhr.send(blob);
  });
}

// The whole path as ONE URL segment (slashes become %2F), so Borel's route
// can take it as a single parameter and no wildcard is involved.
function encodePath(path: string): string {
  return encodeURIComponent(path);
}

/**
 * Files, spelled the way this app's code has always spelled them:
 * db.storage.from("avatars").upload(path, file). A "bucket" here is a folder
 * inside this app's own private store; there is nothing to create first. Store
 * the PATH you uploaded to, and turn it into a URL with getPublicUrl() when you
 * render it.
 */
export const storage = {
  from(bucket: string) {
    return {
      async upload(
        path: string,
        file: Uploadable,
        options: { contentType?: string; onProgress?: (fraction: number) => void } = {},
      ): Promise<StorageResult<{ path: string; fullPath: string }>> {
        let blob: Blob;
        try {
          blob = await toBlob(file);
        } catch (err) {
          return { data: null, error: { message: FILES_SAY.read, detail: err instanceof Error ? err.message : undefined } };
        }
        const contentType = options.contentType || contentTypeOf(file, blob);
        const limit = contentType.toLowerCase().startsWith("video/") ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
        if (blob.size > limit) return { data: null, error: { message: FILES_SAY.tooBig, detail: blob.size + " bytes" } };
        const signed = await storageCall<{ uploadUrl: string }>("presign", { bucket, path, contentType, size: blob.size });
        if (signed.error) return signed;
        try {
          const status = await putBytes(signed.data.uploadUrl, blob, contentType, options.onProgress);
          if (status < 200 || status >= 300) return { data: null, error: { message: FILES_SAY.save, detail: "upload status " + status } };
          if (options.onProgress) options.onProgress(1);
        } catch (err) {
          return { data: null, error: { message: FILES_SAY.offline, detail: err instanceof Error ? err.message : undefined } };
        }
        await storageCall("confirm", { bucket, path, contentType, size: blob.size });
        return { data: { path, fullPath: bucket + "/" + path }, error: null };
      },
      /** A URL that renders in <Image>. Synchronous, so it can be used inline in JSX. */
      getPublicUrl(path: string): { data: { publicUrl: string } } {
        return { data: { publicUrl: BOREL_STORAGE + "/o/" + encodeURIComponent(bucket) + "/" + encodePath(path) } };
      },
      async createSignedUrl(path: string, expiresIn = 3600): Promise<StorageResult<{ signedUrl: string }>> {
        const r = await storageCall<{ url: string }>("sign", { bucket, path, expiresIn }, FILES_SAY.open);
        return r.error ? r : { data: { signedUrl: r.data.url }, error: null };
      },
      async remove(paths: string[]): Promise<StorageResult<{ name: string }[]>> {
        const r = await storageCall<{ removed: string[] }>("remove", { bucket, paths }, FILES_SAY.remove);
        return r.error ? r : { data: r.data.removed.map((name) => ({ name })), error: null };
      },
    };
  },
};

/**
 * The signed-in person's own account. `delete()` removes it on the server:
 * the sign-in itself, every row of theirs in this app's tables, and every file
 * they uploaded. Use it through `deleteAccount()` in core/auth, which also
 * signs the device out.
 */
export const account = {
  async delete(): Promise<{ ok: boolean; error: string | null }> {
    try {
      const bearer = await authHeader();
      if (!bearer || bearer === "bps_anon") return { ok: false, error: "Sign in again to delete your account." };
      const res = await fetch(BOREL_ACCOUNT + "/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...borelHeaders(), Authorization: "Bearer " + bearer },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return { ok: false, error: json.error || "Your account couldn't be deleted. Please try again." };
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
  },
};

// ---------------------------------------------------------------------------
// Reporting and blocking. App Store Review Guideline 1.2: an app where people
// post or message each other must let anyone report objectionable content and
// block abusive users. db.moderation does both through Borel, which tells the
// app's owner about every report. What someone reported, and everyone they
// blocked, is hidden for them at once: filter lists with visible().
// ---------------------------------------------------------------------------
export type ReportReason = "spam" | "abuse" | "sexual" | "violence" | "other";

/** What a post, comment, message or profile is, for a report or a block. */
export interface ModerationTarget {
  /** The row's id. */
  contentId: string;
  /** The table the row is in, so the owner can remove it. */
  table?: string;
  /** The account id of whoever wrote it. */
  authorId?: string | null;
  /** "post", "comment", "message", "profile"... */
  kind?: string;
  /** A short piece of the text, so the owner knows what was reported. */
  excerpt?: string;
}

const BOREL_MODERATION = BOREL_ACCOUNT.slice(0, BOREL_ACCOUNT.lastIndexOf("/")) + "/moderation";
const hiddenContent = new Set<string>();
const blockedAuthors = new Set<string>();
const moderationListeners = new Set<() => void>();
let moderationLoaded: Promise<void> | null = null;
// Bumped whenever the person may have changed, so a load still on its way for
// the last person cannot fill the sets in for the next one.
let moderationEpoch = 0;

function moderationChanged(): void {
  for (const listener of moderationListeners) listener();
}

/** What one person reported and blocked is theirs: forgotten on every sign-in and sign-out, and loaded again for whoever is next. */
function forgetModeration(): void {
  moderationEpoch++;
  moderationLoaded = null;
  if (hiddenContent.size === 0 && blockedAuthors.size === 0) return;
  hiddenContent.clear();
  blockedAuthors.clear();
  moderationChanged();
}

async function moderationCall(path: string, body?: unknown): Promise<{ ok: boolean; json: any }> {
  try {
    const bearer = await authHeader();
    if (!bearer || bearer === "bps_anon") return { ok: false, json: { error: "Sign in to report or block." } };
    const res = await fetch(BOREL_MODERATION + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), Authorization: "Bearer " + bearer },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "Could not reach the server. Check your connection and try again." } };
  }
}

function loadModeration(): Promise<void> {
  if (!moderationLoaded) {
    const epoch = moderationEpoch;
    moderationLoaded = moderationCall("/state").then(({ ok, json }) => {
      if (epoch !== moderationEpoch) return;
      if (!ok) {
        moderationLoaded = null;
        return;
      }
      for (const id of json.reported || []) hiddenContent.add(String(id));
      for (const id of json.blocked || []) blockedAuthors.add(String(id));
      moderationChanged();
    });
  }
  return moderationLoaded;
}

const REASON_LABELS: [ReportReason, string][] = [
  ["spam", "Spam"],
  ["abuse", "Harassment or abuse"],
  ["sexual", "Sexual content"],
  ["violence", "Violence or threats"],
  ["other", "Something else"],
];

export const moderation = {
  /** Sends a report to the app's owner and hides the item for this person. */
  async report(target: ModerationTarget & { reason?: ReportReason }): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/report", {
      contentId: String(target.contentId),
      table: target.table,
      authorId: target.authorId ? String(target.authorId) : undefined,
      kind: target.kind,
      reason: target.reason || "other",
      excerpt: target.excerpt ? String(target.excerpt).slice(0, 500) : undefined,
    });
    if (!ok) return { ok: false, error: json.error || "That report couldn't be sent. Please try again." };
    hiddenContent.add(String(target.contentId));
    moderationChanged();
    return { ok: true, error: null };
  },
  /** Hides everything this account posts or sends, for this person, everywhere they sign in. */
  async block(userId: string): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/block", { userId: String(userId) });
    if (!ok) return { ok: false, error: json.error || "That person couldn't be blocked. Please try again." };
    blockedAuthors.add(String(userId));
    moderationChanged();
    return { ok: true, error: null };
  },
  async unblock(userId: string): Promise<{ ok: boolean; error: string | null }> {
    const { ok, json } = await moderationCall("/unblock", { userId: String(userId) });
    if (!ok) return { ok: false, error: json.error || "That person couldn't be unblocked. Please try again." };
    blockedAuthors.delete(String(userId));
    moderationChanged();
    return { ok: true, error: null };
  },
  /** Account ids this person blocked, for a "Blocked people" list. */
  blockedIds(): string[] {
    void loadModeration();
    return [...blockedAuthors];
  },
  /** True when this item was reported by, or its author blocked by, this person. */
  isHidden(target: { contentId?: string | null; authorId?: string | null }): boolean {
    void loadModeration();
    return Boolean(
      (target.contentId && hiddenContent.has(String(target.contentId))) || (target.authorId && blockedAuthors.has(String(target.authorId))),
    );
  },
  /** The items this person should see: filter every list of posts, comments, messages or profiles through it. */
  visible<T>(items: T[], describe: (item: T) => { contentId?: string | null; authorId?: string | null }): T[] {
    return items.filter((item) => !moderation.isHidden(describe(item)));
  },
  /** Re-renders the calling component when something is reported or someone is blocked. */
  useChanges(): void {
    const [, setTick] = useState(0);
    useEffect(() => {
      const listener = () => setTick((n) => n + 1);
      moderationListeners.add(listener);
      void loadModeration();
      return () => {
        moderationListeners.delete(listener);
      };
    }, []);
  },
  /**
   * The menu behind a post's "..." button: Report, Block, Cancel. Asks for a
   * reason, sends the report, and says what happens next. Resolves true when
   * something was reported or someone was blocked.
   */
  openMenu(target: ModerationTarget & { authorName?: string }): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmBlock = () =>
        Alert.alert(
          "Block " + (target.authorName || "this person") + "?",
          "You won't see anything they post or send.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Block",
              style: "destructive",
              onPress: () => {
                void moderation.block(String(target.authorId)).then((r) => {
                  Alert.alert(r.ok ? "Blocked" : "Couldn't block", r.ok ? "You won't see anything from them." : r.error || "");
                  resolve(r.ok);
                });
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      const chooseReason = () =>
        Alert.alert(
          "Why are you reporting this?",
          undefined,
          [
            ...REASON_LABELS.map(([reason, label]) => ({
              text: label,
              onPress: () => {
                void moderation.report({ ...target, reason }).then((r) => {
                  Alert.alert(
                    r.ok ? "Thanks for reporting" : "Couldn't report",
                    r.ok ? "It's hidden for you now, and it will be reviewed within 24 hours." : r.error || "",
                  );
                  resolve(r.ok);
                });
              },
            })),
            { text: "Cancel", style: "cancel" as const, onPress: () => resolve(false) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      Alert.alert(
        target.kind ? "This " + target.kind : "Options",
        undefined,
        [
          { text: "Report", onPress: chooseReason },
          ...(target.authorId ? [{ text: "Block " + (target.authorName || "this person"), style: "destructive" as const, onPress: confirmBlock }] : []),
          { text: "Cancel", style: "cancel" as const, onPress: () => resolve(false) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  },
  /**
   * Checks text for objectionable content before it is posted where others
   * see it. { allowed: false } means don't post it; show the error sentence.
   */
  async check(text: string): Promise<{ allowed: boolean; error: string | null }> {
    try {
      const res = await fetch(BOREL_MODERATION + "/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...borelHeaders() },
        body: JSON.stringify({ text: String(text || "").slice(0, 20000) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.allowed === false) {
        return { allowed: false, error: "This can't be posted because it may break the community rules. Please change it and try again." };
      }
      return { allowed: true, error: null };
    } catch {
      return { allowed: true, error: null };
    }
  },
};

/** One piece of a message: words, a photo for the AI to look at, or one recording for it to hear (raw base64). */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format?: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** A string, or parts when a user message carries a photo (up to 4 per request). */
  content: string | ChatContentPart[];
}

/** One photo from the device: an entry in the `assets` that pickImageAsset() and launchCamera() resolve. */
export type AiImageAsset = { uri: string; base64?: string | null; mimeType?: string | null };
/**
 * A photo as an address (pickImage() resolves one), an asset, or the whole
 * { canceled, assets } result of pickImageAsset() or launchCamera().
 */
export type AiImageInput = string | AiImageAsset | { canceled?: boolean; assets?: AiImageAsset[] | null } | null | undefined;

// Said when a request carries no photo at all: the picker was cancelled, or
// the code read `.uri` off a result that has none. Without it the missing
// photo reached fetch() and came back as a connection error.
const NO_PHOTO = "No photo was chosen.";

// A blob as a data: URL. FileReader where the platform has it (React Native
// and browsers); otherwise the bytes are encoded here, since React Native has
// no global base64 encoder to lean on.
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[n & 63] : "=";
  }
  return out;
}
async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return "data:" + (blob.type || "image/jpeg") + ";base64," + encodeBase64(bytes);
}

// What Borel can read: an https address or a data: URL. A file:// or content://
// uri from the device is only readable here, so it is turned into a data: URL
// before it leaves the phone.
async function sendableImage(input: AiImageInput): Promise<string> {
  // A picker's whole result stands for its first photo.
  const picked = input && typeof input === "object" && "assets" in input ? input.assets && input.assets[0] : input;
  const asset = picked && typeof picked === "object" ? (picked as AiImageAsset) : null;
  const uri = typeof picked === "string" ? picked : asset ? asset.uri : "";
  if (uri && (uri.startsWith("https://") || uri.startsWith("data:"))) return uri;
  if (asset && asset.base64) {
    return asset.base64.startsWith("data:") ? asset.base64 : "data:" + (asset.mimeType || "image/jpeg") + ";base64," + asset.base64;
  }
  if (!uri) throw new Error(NO_PHOTO);
  const res = await fetch(uri);
  return await blobToDataUrl(await res.blob());
}

/** A recording from the device: what stopRecording() resolves, or the `recording` recordAudio() resolves. */
export type AiAudioRecording = { uri?: string | null; base64?: string | null; mimeType?: string | null; fileSize?: number | null };
/** A recording, recordAudio()'s whole { canceled, recording } result, or a data: URL. */
export type AiAudioInput = string | AiAudioRecording | { canceled?: boolean; recording?: AiAudioRecording | null } | null | undefined;

// Said when there is no recording at all: recordAudio() was cancelled, or
// stopRecording() found nothing to stop.
const NO_RECORDING = "No recording was made.";
const RECORDING_TOO_LONG = "That recording is too long to send, so try a shorter one.";
const RECORDING_UNREADABLE = "That recording couldn't be read, so please record it again.";
// The base64 of 3 MB: the most a phone encodes, and the most Borel forwards.
const MAX_AUDIO_BYTES = 3145728;
const MAX_AUDIO_BASE64 = 4194304;

/** The short format name Borel is told a recording is in. Borel reads the bytes itself; this is a hint. */
function audioFormatOf(mimeType: string | null | undefined): string {
  const base = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (base === "audio/m4a" || base === "audio/x-m4a" || base === "audio/mp4") return "m4a";
  if (base === "audio/webm") return "webm";
  if (base === "audio/ogg" || base === "audio/opus") return "ogg";
  if (base === "audio/mpeg" || base === "audio/mp3") return "mp3";
  if (base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave") return "wav";
  if (base === "audio/aac") return "aac";
  if (base === "audio/flac") return "flac";
  return "";
}

// What Borel can hear: the recording's base64 (or a data: URL). A recording
// that lives only on the device, named by its uri, is read into one here.
async function sendableAudio(input: AiAudioInput): Promise<{ data: string; format: string }> {
  const picked = input && typeof input === "object" && "recording" in input ? input.recording : input;
  if (!picked) throw new Error(NO_RECORDING);
  if (typeof picked === "string") {
    if (picked.startsWith("data:")) {
      if (picked.length > MAX_AUDIO_BASE64 + 100) throw new Error(RECORDING_TOO_LONG);
      return { data: picked, format: audioFormatOf(picked.slice(5, picked.indexOf(";"))) };
    }
    const blob = await (await fetch(picked)).blob();
    if (blob.size > MAX_AUDIO_BYTES) throw new Error(RECORDING_TOO_LONG);
    return { data: await blobToDataUrl(blob), format: audioFormatOf(blob.type) };
  }
  const recording = picked as AiAudioRecording;
  if (recording.base64) {
    if (recording.base64.length > MAX_AUDIO_BASE64 + 100) throw new Error(RECORDING_TOO_LONG);
    return { data: recording.base64, format: audioFormatOf(recording.mimeType) };
  }
  if (recording.uri) {
    // A recording comes back without base64 when it was too long to encode;
    // anything else named only by its uri is read from the device.
    if ((recording.fileSize || 0) > MAX_AUDIO_BYTES) throw new Error(RECORDING_TOO_LONG);
    return sendableAudio(recording.uri);
  }
  throw new Error(NO_RECORDING);
}

/**
 * AI for this app, with no key to paste: every request goes through Borel,
 * which picks the model that can answer it (a message with a photo is read by
 * one that sees images). Request/response only (no streaming). `text` is the
 * assistant's reply; `error` is a sentence you can show as-is, on every
 * surface. When Borel refused the call, `reason` says why (wallet_empty,
 * daily_allowance_used, cloud_paused) and `error` is deliberately neutral:
 * the owner is told about balance by Borel, never by this app.
 */
/**
 * Every request through here settles, always.
 *
 * `fetch` has no timeout of its own: a stalled connection leaves the promise
 * pending forever, and a screen that set `loading = true` before awaiting it
 * spins until the app is closed. The server gives up on an image at 120s, so
 * this waits a little longer than that and then answers for it.
 */
async function borelFetch(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced as well as aborted: a platform whose fetch ignores the signal still settles.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error("The request took too long.");
      err.name = "AbortError";
      reject(err);
    }, timeoutMs);
  });
  const request = (async () => {
    // The signed-in person's token, when there is one: Borel gives each
    // signed-in person their own share of the app's daily AI.
    const bearer = await authHeader();
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), ...(bearer ? { Authorization: "Bearer " + bearer } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** A chat waits longer than the server's 60 seconds plus its one fallback model. */
const AI_TIMEOUT_MS = 75000;

const AI_SAYS = {
  offline: "Couldn't reach the AI, so check your connection and try again.",
  slow: "The AI took too long to answer, so please try again.",
  failed: "The AI couldn't answer that right now, so please try again.",
  tooLong: "That answer was too long, so try asking for less.",
  unreadable: "That answer came back in a form this app couldn't read, so please try again.",
  photo: "That photo couldn't be read, so try picking it again.",
  picture: "The picture couldn't be made right now, so please try again.",
  pictureSlow: "The picture took too long, so please try again.",
  edit: "That picture couldn't be changed right now, so please try again.",
  transcribe: "Couldn't write down that recording right now, so please try again.",
  noSpeech: "No words were heard in that recording, so please try again.",
  transcriptTooLong: "That recording was too long to write down, so try a shorter one.",
};

/**
 * What db.ai.chat resolves. `text` is the reply as it came; with `json: true`,
 * `data` is that reply read as JSON (null when it could not be). `error` is
 * one sentence to show; `detail` and `raw` are for whoever reads the code.
 * `truncated` means the answer hit max_tokens and was cut off.
 */
export type AiChatResult = {
  text: string | null;
  data: any;
  error: string | null;
  status: number;
  reason: AiRefusal | null;
  truncated: boolean;
  raw: unknown;
  detail: string | null;
};

const JSON_ONLY = "Reply with valid JSON only: no code fences, and no words before or after it.";

/** The JSON-only instruction, added to the first system message (or as one) so there is still only one. */
function asksForJson(messages: ChatMessage[]): ChatMessage[] {
  const first = messages[0];
  if (first && first.role === "system" && typeof first.content === "string") {
    return [{ role: "system", content: first.content + String.fromCharCode(10, 10) + JSON_ONLY }, ...messages.slice(1)];
  }
  return [{ role: "system", content: JSON_ONLY }, ...messages];
}

/** Where the object or list that starts at `start` ends, skipping brackets inside strings; -1 when it never does. */
function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (s.charCodeAt(i) === 92) escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** A model's reply read as JSON: inside a code fence, or the first whole object or list among other words. */
function readJson(text: string | null): { ok: true; value: any } | { ok: false } {
  if (typeof text !== "string") return { ok: false };
  let s = text.trim();
  const fence = String.fromCharCode(96, 96, 96);
  const open = s.indexOf(fence);
  if (open !== -1) {
    const lineEnd = s.indexOf(String.fromCharCode(10), open);
    if (lineEnd !== -1) {
      const close = s.indexOf(fence, lineEnd);
      s = s.slice(lineEnd + 1, close === -1 ? undefined : close).trim();
    }
  }
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    // words around it; look for the object or list itself
  }
  let tries = 0;
  for (let start = 0; start < s.length && tries < 20; start++) {
    const c = s[start];
    if (c !== "{" && c !== "[") continue;
    tries++;
    const end = balancedEnd(s, start);
    if (end === -1) continue;
    try {
      return { ok: true, value: JSON.parse(s.slice(start, end + 1)) };
    } catch {
      // not this one
    }
  }
  return { ok: false };
}

function chatFailure(error: string, status: number, extra: Partial<AiChatResult> = {}): AiChatResult {
  return { text: null, data: null, error, status, reason: null, truncated: false, raw: null, detail: null, ...extra };
}

/** One request to Borel's chat, settled with a plain sentence whatever happens. */
async function chatOnce(body: unknown): Promise<AiChatResult> {
  try {
    const res = await borelFetch(BOREL_AI + "/chat/completions", body, AI_TIMEOUT_MS);
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = refusalOf(res.status, json);
      if (reason) noteRefusal(reason);
      const said = messageOf(json);
      return {
        text: null,
        data: null,
        error: reason ? NEUTRAL_ERROR[reason] : looksPlain(said) ? said.trim() : AI_SAYS.failed,
        status: res.status,
        reason,
        truncated: false,
        raw: json,
        detail: json && typeof json.detail === "string" ? json.detail : said,
      };
    }
    if (IN_BROWSER) postToParent({ type: "ai:metered" });
    const choice = json && Array.isArray(json.choices) ? json.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : null;
    if (typeof content !== "string") return chatFailure(AI_SAYS.failed, res.status, { raw: json, detail: "The answer carried no text." });
    return { text: content, data: null, error: null, status: res.status, reason: null, truncated: Boolean(choice && choice.finish_reason === "length"), raw: json, detail: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return chatFailure(aborted ? AI_SAYS.slow : AI_SAYS.offline, 0, { detail: err instanceof Error ? err.message : null });
  }
}

/**
 * What db.ai.transcribe resolves. `text` is what was said, and null exactly
 * when `error` is set; `error` is one sentence to show; `detail` is for
 * whoever reads the code.
 */
export type AiTranscribeResult = { text: string | null; error: string | null; status: number; reason: AiRefusal | null; detail: string | null };

// Written for a learner as much as for dictation: what was really said, never
// what should have been, so a check against the phrase they meant is honest.
const TRANSCRIBE_RULES =
  "You write down speech exactly as it was spoken. Reply with only the words said in the recording, in the language and alphabet they were said in, with ordinary punctuation. " +
  "Never translate, answer, summarize, explain or correct them: a wrong or mispronounced word is written the way it sounded. If nobody speaks, reply with exactly: [no speech]";

function transcribeInstruction(language: unknown, prompt: unknown): string {
  let rules = TRANSCRIBE_RULES;
  if (typeof language === "string" && language.trim()) {
    rules += " The speaker is expected to speak " + language.trim().slice(0, 40) + ", but write down whatever language is really spoken.";
  }
  if (typeof prompt === "string" && prompt.trim()) rules += " Names and words that may come up: " + prompt.trim().slice(0, 500);
  return rules;
}

function transcribeFailure(error: string, status: number, detail: string | null = null): AiTranscribeResult {
  return { text: null, error, status, reason: null, detail };
}

/** True when the model said it heard nobody speak, however it punctuated it. */
function heardNoSpeech(text: string): boolean {
  let letters = "";
  for (const c of text.toLowerCase()) if ((c >= "a" && c <= "z") || c === " ") letters += c;
  return letters.trim() === "no speech";
}

/**
 * One request per prompt per session, and one in flight at a time.
 *
 * Borel stores a generated image under a key derived from its prompt, so
 * asking twice is already free and instant. This is the layer above that: two
 * components mounting at once (or React re-running an effect) would otherwise
 * fire two requests for the same picture, and the first one would still be
 * generating when the second arrived to find nothing stored yet. Sharing the
 * promise makes that one call. Failures are dropped so a retry is possible.
 */
export type AiImageResult = { url: string | null; error: string | null; status: number; reason: AiRefusal | null };
const inFlightImages = new Map<string, Promise<AiImageResult>>();

export const ai = {
  /** Curated ids. Do not invent others. Both answer today; "smart" is a stronger model for harder asks. */
  models: { fast: "qwen3-next-80b-a3b-instruct", smart: "gemini-3-flash" },
  // json: true asks for JSON only and reads the reply into data (fences and
  // words around it are fine); an answer that can't be read is asked for once more.
  async chat(input: { model?: string; messages: ChatMessage[]; temperature?: number; max_tokens?: number; json?: boolean }): Promise<AiChatResult> {
    try {
      const withPhoto = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "image_url"));
      const withAudio = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "input_audio"));
      if (!(await askAiConsent(withAudio ? "audio" : withPhoto ? "photoChat" : "chat", input.model || ai.models.fast))) {
        return chatFailure(AI_DECLINED, 0);
      }
      // A photo from the device becomes something Borel can read before it is sent.
      let messages: ChatMessage[] = [];
      try {
        for (const m of input.messages) {
          if (typeof m.content === "string") {
            messages.push(m);
            continue;
          }
          const parts: ChatContentPart[] = [];
          for (const part of m.content) {
            parts.push(part.type === "image_url" ? { type: "image_url", image_url: { url: await sendableImage(part.image_url.url) } } : part);
          }
          messages.push({ role: m.role, content: parts });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : null;
        return chatFailure(detail === NO_PHOTO ? NO_PHOTO : AI_SAYS.photo, 0, { detail });
      }
      if (input.json) messages = asksForJson(messages);
      const body = { model: input.model || ai.models.fast, messages, temperature: input.temperature, max_tokens: input.max_tokens };
      if (!input.json) return await chatOnce(body);
      let last: AiChatResult = chatFailure(AI_SAYS.unreadable, 0);
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await chatOnce(body);
        if (r.error) return r;
        if (r.truncated) return { ...r, error: AI_SAYS.tooLong, detail: "The answer reached max_tokens and was cut off." };
        const read = readJson(r.text);
        if (read.ok) return { ...r, data: read.value };
        last = { ...r, error: AI_SAYS.unreadable, detail: "The answer was not valid JSON." };
      }
      return last;
    } catch (err) {
      return chatFailure(AI_SAYS.failed, 0, { detail: err instanceof Error ? err.message : null });
    }
  },
  // Write down what was said in a recording: dictation, a voice note's text,
  // what a learner said aloud. `audio` is what stopRecording() resolves, what
  // recordAudio() resolves (or its `recording`), or a data: URL. `language`
  // is what the speaker is expected to speak ("es", "Japanese"); `prompt` is
  // names or words the recording may contain, never the answer hoped for.
  async transcribe(input: { audio: AiAudioInput; language?: string; prompt?: string }): Promise<AiTranscribeResult> {
    try {
      let clip: { data: string; format: string };
      try {
        clip = await sendableAudio(input ? input.audio : null);
      } catch (err) {
        const detail = err instanceof Error ? err.message : null;
        const said = detail === NO_RECORDING || detail === RECORDING_TOO_LONG ? detail : RECORDING_UNREADABLE;
        return transcribeFailure(said, 0, detail);
      }
      if (!(await askAiConsent("audio", AI_AUDIO_MODEL))) return transcribeFailure(AI_DECLINED, 0);
      const r = await chatOnce({
        model: AI_AUDIO_MODEL,
        // A transcript is short; the room is for a model that thinks first.
        max_tokens: 2048,
        messages: [
          { role: "system", content: transcribeInstruction(input.language, input.prompt) },
          {
            role: "user",
            content: [
              { type: "text", text: "Write down what is said in this recording." },
              { type: "input_audio", input_audio: clip },
            ],
          },
        ],
      });
      if (r.error) {
        const detail = typeof r.detail === "string" ? r.detail : null;
        return { text: null, error: r.error === AI_SAYS.failed ? AI_SAYS.transcribe : r.error, status: r.status, reason: r.reason, detail };
      }
      if (r.truncated) return transcribeFailure(AI_SAYS.transcriptTooLong, r.status, "The transcript reached max_tokens and was cut off.");
      const text = String(r.text || "").trim();
      if (!text || heardNoSpeech(text)) return transcribeFailure(AI_SAYS.noSpeech, r.status, "The recording had no speech in it.");
      return { text, error: null, status: r.status, reason: null, detail: null };
    } catch (err) {
      return transcribeFailure(AI_SAYS.transcribe, 0, err instanceof Error ? err.message : null);
    }
  },
  // Generate an image from a text prompt. No key, no config: Borel makes the
  // picture, stores it in this app's files, and hands back a ready image URL.
  image(input: {
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
  }): Promise<AiImageResult> {
    const key = (input.prompt || "") + "|" + (input.size || "");
    const existing = inFlightImages.get(key);
    if (existing) return existing;
    const pending = (async () => {
      try {
        if (!(await askAiConsent("image", ""))) return { url: null, error: AI_DECLINED, status: 0, reason: null };
        const res = await borelFetch(BOREL_AI + "/images/generations", { prompt: input.prompt, size: input.size }, 150000);
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string | { message?: string } };
        if (!res.ok) {
          const reason = refusalOf(res.status, json);
          if (reason) noteRefusal(reason);
          const message = typeof json.error === "string" ? json.error : json.error && json.error.message;
          return {
            url: null,
            error: reason ? NEUTRAL_ERROR[reason] : looksPlain(message) ? message.trim() : AI_SAYS.picture,
            status: res.status,
            reason,
          };
        }
        if (IN_BROWSER && !(json as any).reused) postToParent({ type: "ai:metered" });
        return { url: typeof json.url === "string" ? json.url : null, error: null, status: res.status, reason: null };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        return {
          url: null,
          error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline,
          status: 0,
          reason: null,
        };
      }
    })();
    inFlightImages.set(key, pending);
    // A picture that was made is worth remembering for the rest of the
    // session; a failure is not, or a hiccup would be permanent.
    void pending.then((result) => {
      if (result.error) inFlightImages.delete(key);
    });
    return pending;
  },
  // Change a picture with words: "make it a watercolor", "add a party hat".
  // `image` is an https address, a data: URL, what pickImage() resolves, or
  // the result (or its assets[0]) of pickImageAsset() or launchCamera().
  // Borel makes the new picture, stores it in this app's files, and hands back
  // a ready image URL; the same picture and words give the same URL again.
  async editImage(input: {
    image: AiImageInput;
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
  }): Promise<AiImageResult> {
    try {
      if (!(await askAiConsent("editImage", ""))) return { url: null, error: AI_DECLINED, status: 0, reason: null };
      const image = await sendableImage(input.image);
      const res = await borelFetch(BOREL_AI + "/images/edits", { image, prompt: input.prompt, size: input.size }, 150000);
      const json = (await res.json().catch(() => ({}))) as { url?: string; reused?: boolean; error?: string | { message?: string } };
      if (!res.ok) {
        const reason = refusalOf(res.status, json);
        if (reason) noteRefusal(reason);
        const message = typeof json.error === "string" ? json.error : json.error && json.error.message;
        return {
          url: null,
          error: reason ? NEUTRAL_ERROR[reason] : looksPlain(message) ? message.trim() : AI_SAYS.edit,
          status: res.status,
          reason,
        };
      }
      if (IN_BROWSER && !json.reused) postToParent({ type: "ai:metered" });
      return { url: typeof json.url === "string" ? json.url : null, error: null, status: res.status, reason: null };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        url: null,
        error: aborted ? AI_SAYS.pictureSlow : err instanceof Error && err.message === NO_PHOTO ? NO_PHOTO : AI_SAYS.offline,
        status: 0,
        reason: null,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Notifying particular people of this app: "Bo commented on your photo".
//
// db.notify({ userIds, title, body, data }) asks Borel to notify each person
// named, on every phone they are signed in on and allowed notifications on. It
// never throws; it resolves { ok, error, reason } for code that wants to know.
//
// For that to reach anyone, a phone has to be linked to the person signed in
// on it, and this file does that by itself: borel-systemui announces this
// device's push token once someone allows notifications
// (registerForPushNotifications), and from then on the device is linked to
// whoever signs in and let go of before they sign out. No screen ever sees or
// sends a token. The browser preview and Expo Go never have a push token of
// their own for this app, so nothing is linked there.
// ---------------------------------------------------------------------------
const BOREL_PROXY = BOREL_ACCOUNT.slice(0, BOREL_ACCOUNT.lastIndexOf("/"));
const PUSH_TOKEN_KEY = "borel.push.deviceToken";
const PUSH_LINKED_KEY = "borel.push.linked:" + BOREL_PROXY;
const NOTIFY_TIMEOUT_MS = 20000;
const DEVICE_CALL_TIMEOUT_MS = 10000;
const SIGN_OUT_WAIT_MS = 4000;

const NOTIFY_SAYS = {
  signedOut: "Sign in to send notifications.",
  failed: "The notification couldn't be sent right now, so please try again later.",
  offline: "Couldn't send the notification, so check your connection and try again.",
};

export type NotifyResult = { ok: boolean; error: string | null; reason: string | null };

async function notify(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}): Promise<NotifyResult> {
  try {
    const bearer = await authHeader();
    if (!bearer || bearer === "bps_anon") return { ok: false, error: NOTIFY_SAYS.signedOut, reason: "signed_out" };
    const request = {
      userIds: (Array.isArray(input.userIds) ? input.userIds : []).map((id) => String(id)),
      title: String(input.title == null ? "" : input.title),
      body: String(input.body == null ? "" : input.body),
      ...(input.data ? { data: input.data } : {}),
    };
    const res = await borelFetch(BOREL_PROXY + "/notify", request, NOTIFY_TIMEOUT_MS);
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, error: null, reason: null };
    const refusal = refusalOf(res.status, json);
    if (refusal) {
      noteRefusal(refusal, "cloud");
      return { ok: false, error: CLOUD_NEUTRAL[refusal], reason: refusal };
    }
    const said = messageOf(json);
    return {
      ok: false,
      error: looksPlain(said) ? said.trim() : NOTIFY_SAYS.failed,
      reason: json && typeof json.reason === "string" ? json.reason : null,
    };
  } catch {
    return { ok: false, error: NOTIFY_SAYS.offline, reason: null };
  }
}

let announcedToken: string | null = null;
let linkedThisLaunch: string | null = null;
let deviceWork: Promise<void> = Promise.resolve();

/** One device step at a time, so a sign-in and a sign-out can never cross. */
function followDevice(step: () => Promise<void>): Promise<void> {
  deviceWork = deviceWork.then(step).catch(() => {});
  return deviceWork;
}

async function atMost(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([work, new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

async function deviceToken(): Promise<string | null> {
  if (announcedToken) return announcedToken;
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function deviceCall(path: string, body: unknown, bearer?: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(BOREL_PROXY + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders(), ...(bearer ? { Authorization: "Bearer " + bearer } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Let go of this device's person. Holding the device's token is the proof, so no sign-in is sent. */
async function releaseDevice(known?: string | null): Promise<void> {
  const token = known || (await deviceToken());
  if (!token) return;
  let linked = linkedThisLaunch !== null;
  if (!linked) {
    try {
      linked = (await AsyncStorage.getItem(PUSH_LINKED_KEY)) !== null;
    } catch {
      linked = false;
    }
  }
  if (!linked) return;
  if (await deviceCall("/push/unlink", { token })) {
    linkedThisLaunch = null;
    try {
      await AsyncStorage.removeItem(PUSH_LINKED_KEY);
    } catch {
      // Tried again on the next launch, which is harmless.
    }
  }
}

/** Link this device to whoever is signed in now, or let it go when nobody is. */
async function syncDevice(): Promise<void> {
  const token = await deviceToken();
  // Nobody allowed notifications on this phone: nothing to link, and no reason to read the session.
  if (!token) return;
  let session: any = null;
  try {
    const { data } = await native().auth.getSession();
    session = data ? data.session : null;
  } catch {
    session = null;
  }
  const userId = session && session.user && session.user.id ? String(session.user.id) : null;
  if (!userId || !session.access_token) {
    await releaseDevice(token);
    return;
  }
  const key = userId + ":" + token;
  if (linkedThisLaunch === key) return;
  const ios = Constants && Constants.expoConfig ? (Constants.expoConfig as any).ios : null;
  const linked = await deviceCall("/push/link", { token, platform: "ios", bundleId: ios ? ios.bundleIdentifier : null }, session.access_token);
  if (!linked) return;
  linkedThisLaunch = key;
  try {
    await AsyncStorage.setItem(PUSH_LINKED_KEY, "1");
  } catch {
    // Only the offline sign-out case needs this, and it retries anyway.
  }
}

let watchingSessions = false;

/** Sign-ins and sign-outs matter only once this phone has a token to link, so nothing is subscribed before. */
function watchSessions(): void {
  if (watchingSessions) return;
  watchingSessions = true;
  try {
    const auth = native().auth;
    if (auth && typeof auth.onAuthStateChange === "function") {
      auth.onAuthStateChange(() => {
        void followDevice(syncDevice);
      });
    }
  } catch {
    // An auth client that cannot be watched: launches and sign-outs still sync.
  }
}

function watchDevice(): void {
  if (IN_BROWSER) return;
  try {
    const g = globalThis as any;
    if (!g.__borelPushTokenListeners) g.__borelPushTokenListeners = new Set();
    g.__borelPushTokenListeners.add((token: unknown) => {
      if (typeof token !== "string" || !token) return;
      announcedToken = token;
      watchSessions();
      void followDevice(syncDevice);
    });
  } catch {
    // No global to share: the token is still read from device storage.
  }
  void followDevice(async () => {
    if (!(await deviceToken())) return;
    watchSessions();
    await syncDevice();
  });
  try {
    const auth = native().auth;
    if (auth && typeof auth.signOut === "function") {
      const signOut = auth.signOut.bind(auth);
      // Let go first, while this is still unmistakably the person's own phone,
      // and never hold the sign-out up for long if Borel cannot be reached.
      auth.signOut = async (...args: any[]) => {
        await atMost(followDevice(() => releaseDevice()), SIGN_OUT_WAIT_MS);
        return signOut(...args);
      };
    }
  } catch {
    // An auth client that cannot be watched still signs in and out as before.
  }
}
watchDevice();

// ---------------------------------------------------------------------------
// Telling the screens who is signed in, on a phone
//
// The sign-in adapter reports the session once, when a screen subscribes, and
// never again: a sign-in, a confirmed code or a sign-out in this same app
// reached no screen until it was mounted again, so a Sign in button could look
// like it did nothing. So this file tells every subscriber itself, after each
// call that changes who is signed in - and after Borel hands the app a session
// it made (adoptSession: Sign in with Apple). The preview's broker already
// tells its own listeners.
// ---------------------------------------------------------------------------
type AuthCallback = (event: string, session: any) => void;
const phoneSubscribers: AuthCallback[] = [];

async function tellScreens(): Promise<void> {
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

/**
 * A session Borel made for this person on this app's cloud (Sign in with
 * Apple, in core/auth), kept exactly as the app's own email sign-in keeps its
 * session - the same cookies under the same key - and told to every screen.
 */
export async function adoptSession(setCookie: string[]): Promise<boolean> {
  if (IN_BROWSER || !Array.isArray(setCookie) || setCookie.length === 0) return false;
  await loadSessionCookies();
  sessionCookies = {};
  rememberCookies(setCookie);
  saveSessionCookies();
  await tellScreens();
  return true;
}

/** One call to Borel's Sign in with Apple endpoints for this app. core/auth's signInWithApple uses it; screens never do. */
export async function appleCall(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const res = await fetch(BOREL_APPLE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...borelHeaders() },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: "Couldn't reach the sign-in service, so check your connection and try again." } };
  }
}

/** The client: db.from("table").select(), db.auth, db.storage, db.ai, db.account, db.moderation, db.notify. Show plainError(error, "save" | "load") for a db.from failure. */
export const db = Object.assign(client, { auth: IN_BROWSER ? brokerAuth : native().auth, storage, ai, account, moderation, notify });
