import type { Context } from "hono";
import { borelAiUrl } from "../env.js";
import {
  AI_SAYS,
  BOREL_FORWARD_HEADERS,
  BOREL_TIMEOUT_MS,
  CODE_CHARACTERS,
  NEUTRAL_ERROR,
  TECHNICAL_WORDS,
} from "./constants.js";
import type { AiImageResult, AiRefusal, FetchSeam, Loose } from "./types.js";

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
export function messageOf(json: Loose): string | null {
  if (!json || typeof json !== "object") return null;
  if (typeof json.error === "string") return json.error;
  if (json.error && typeof json.error.message === "string") return json.error.message;
  return typeof json.message === "string" ? json.message : null;
}

export function refusalOf(status: number, json: Loose): AiRefusal | null {
  const reason = json && typeof json.reason === "string" ? json.reason : null;
  if (reason === "wallet_empty" || reason === "daily_allowance_used" || reason === "cloud_paused") return reason;
  if (status !== 402) return null;
  const text = json && typeof json.error === "string" ? json.error : "";
  if (/cloud is paused/i.test(text)) return "cloud_paused";
  if (/AI allowance/i.test(text)) return "daily_allowance_used";
  if (/AI is paused/i.test(text)) return "wallet_empty";
  return null;
}

/**
 * One plain sentence for an OpenRouter failure. Codes that mean a state the
 * learner cannot fix resolve to the app's standing sentences; any other code
 * shows the API's words only when they already read as one plain sentence.
 */
export function openRouterSays(status: number, said: string | null): string {
  if (status === 402 || status === 404) return NEUTRAL_ERROR.wallet_empty;
  if (status === 403 || status === 429) return NEUTRAL_ERROR.daily_allowance_used;
  if (status === 401 || status === 502) return AI_SAYS.failed;
  return looksPlain(said) ? said.trim() : AI_SAYS.failed;
}

/** The real OpenRouter fetch: one AbortController for the whole request budget. */
export async function openrouterFetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The real Borel fetch: the request races its own timeout, which rejects as an AbortError. */
export async function borelFetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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
  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function jsonBody(c: Context): Promise<Loose> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/**
 * One Borel image call: a transparent proxy so Borel's metering, refusal
 * wording, and surface policy behave exactly as they do when the client
 * calls Borel directly.
 */
export async function imageProxy(fetchBorel: FetchSeam, path: string, payload: unknown, fallback: string, headers: Headers): Promise<AiImageResult> {
  const forward: Record<string, string> = {};
  for (const [name, sent] of BOREL_FORWARD_HEADERS) {
    const value = headers.get(name);
    if (value) forward[sent] = value;
  }
  try {
    const res = await fetchBorel(borelAiUrl() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forward },
      body: JSON.stringify(payload),
    }, BOREL_TIMEOUT_MS);
    const json: Loose = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = refusalOf(res.status, json);
      const message = typeof json.error === "string" ? json.error : json.error && json.error.message;
      return {
        url: null,
        error: reason ? NEUTRAL_ERROR[reason] : looksPlain(message) ? message.trim() : fallback,
        status: res.status,
        reason,
        reused: null,
      };
    }
    return {
      url: typeof json.url === "string" ? json.url : null,
      error: null,
      status: res.status,
      reason: null,
      reused: typeof json.reused === "boolean" ? json.reused : null,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      url: null,
      error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline,
      status: 0,
      reason: null,
      reused: null,
    };
  }
}
