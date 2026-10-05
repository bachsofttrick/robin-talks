import { Alert, Linking } from "react-native";
import { IN_BROWSER, SURFACE, BOREL_USAGE_URL } from "./config";

export type AiRefusal = "wallet_empty" | "daily_allowance_used" | "cloud_paused";

export const CLOUD_NEUTRAL: Record<AiRefusal, string> = {
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

export function looksPlain(text: unknown): text is string {
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
    if (code === 10 || code === 13 || code === 92 || code === 96) return false;
    if (CODE_CHARACTERS.indexOf(c) !== -1) return false;
    if ((c === "." || c === "!" || c === "?") && i < s.length - 1) return false;
    const lower = code >= 97 && code <= 122;
    const upper = code >= 65 && code <= 90;
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
export function messageOf(json: any): string | null {
  if (!json || typeof json !== "object") return null;
  if (typeof json.error === "string") return json.error;
  if (json.error && typeof json.error.message === "string") return json.error.message;
  return typeof json.message === "string" ? json.message : null;
}

const DATA_SAYS = {
  save: "That didn't save, so check your connection and try again.",
  load: "Couldn't load this right now, so please try again.",
};

export function plainError(error: unknown, action: "save" | "load" = "save"): string | null {
  if (!error) return null;
  const e = typeof error === "object" ? (error as { code?: unknown; reason?: unknown }) : {};
  const code = typeof e.code === "string" ? e.code : typeof e.reason === "string" ? e.reason : "";
  if (code === "wallet_empty" || code === "daily_allowance_used" || code === "cloud_paused") return CLOUD_NEUTRAL[code];
  return action === "load" ? DATA_SAYS.load : DATA_SAYS.save;
}

export function refusalOf(status: number, json: any): AiRefusal | null {
  const reason = json && typeof json.reason === "string" ? json.reason : null;
  if (reason === "wallet_empty" || reason === "daily_allowance_used" || reason === "cloud_paused") return reason;
  if (status !== 402) return null;
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
const CLOUD_NOTICE_TITLE: Record<AiRefusal, string> = { ...NOTICE_TITLE, wallet_empty: "Your app's cloud is paused in Borel" };
const CLOUD_NOTICE_BODY: Record<AiRefusal, string> = {
  ...NOTICE_BODY,
  wallet_empty: "This app's database, files and AI are paused because your Borel balance is empty. Add funds under Tools > Usage and they pick up right away.",
};
const noticed = new Set<string>();

export function postToParent(message: Record<string, unknown>): void {
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "borel-app", ...message }, "*");
    }
  } catch {
    // no parent to tell
  }
}

export function noteRefusal(reason: AiRefusal, kind: "ai" | "cloud" = "ai"): void {
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
