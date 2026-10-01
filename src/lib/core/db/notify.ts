import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { BOREL_ACCOUNT, IN_BROWSER, borelHeaders } from "./config";
import { native, authHeader } from "./auth";
import { refusalOf, noteRefusal, looksPlain, messageOf, CLOUD_NEUTRAL } from "./errors";
import { forgetModeration } from "./moderation";

export async function borelFetch(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error("The request took too long.");
      err.name = "AbortError";
      reject(err);
    }, timeoutMs);
  });
  const request = (async () => {
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

async function sendNotify(input: {
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

export const notify = { notify: sendNotify };

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
