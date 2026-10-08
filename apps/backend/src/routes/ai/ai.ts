import { Hono, type Context } from "hono";
import { OpenRouterCore } from "@openrouter/sdk/core";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import type { ChatRequest } from "@openrouter/sdk/models";
import { auth } from "../../lib/auth.js";
import { borelAiUrl, openRouterApiKey } from "../../lib/env.js";

// Provider bodies and SDK results are read loosely, as the moved transport did.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type AiRefusal = "wallet_empty" | "daily_allowance_used" | "cloud_paused";

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

/**
 * An OpenRouter structured-output schema. With one, the reply is forced to
 * match `schema` (OpenRouter's response_format json_schema), so it parses
 * without the guesswork readJson() otherwise falls back on.
 */
export type AiJsonSchema = {
  /** Schema name (a-z, A-Z, 0-9, underscores, dashes, max 64 chars). */
  name: string;
  /** The JSON Schema object the reply must satisfy. */
  schema: Record<string, unknown>;
};

/**
 * What POST /api/ai/chat answers. `text` is the reply as it came; with a
 * `jsonSchema` supplied, `data` is that reply read as JSON (null when it could
 * not be). `error` is one sentence to show; `detail` and `raw` are for whoever
 * reads the code. `truncated` means the answer hit max_tokens and was cut off.
 */
export type AiChatResult = {
  text: string | null;
  data: Loose;
  error: string | null;
  status: number;
  reason: AiRefusal | null;
  truncated: boolean;
  raw: unknown;
  detail: string | null;
};

/** What POST /api/ai/transcribe answers. */
export type AiTranscribeResult = { text: string | null; error: string | null; status: number; reason: AiRefusal | null; detail: string | null };

/**
 * What the image endpoints answer. `reused` is Borel's own flag on success
 * (null when it sent none) and null on every failure.
 */
export type AiImageResult = { url: string | null; error: string | null; status: number; reason: AiRefusal | null; reused: boolean | null };

const NEUTRAL_ERROR: Record<AiRefusal, string> = {
  wallet_empty: "AI isn't available right now, so please try again later.",
  daily_allowance_used: "AI has reached today's limit, so it's back tomorrow.",
  cloud_paused: "This isn't available right now, so please try again later.",
};

const AI_SAYS = {
  offline: "Couldn't reach the AI, so check your connection and try again.",
  slow: "The AI took too long to answer, so please try again.",
  failed: "The AI couldn't answer that right now, so please try again.",
  badModel: "The app can't use that model, so please try again.",
  tooLong: "That answer was too long, so try asking for less.",
  unreadable: "That answer came back in a form this app couldn't read, so please try again.",
  picture: "The picture couldn't be made right now, so please try again.",
  pictureSlow: "The picture took too long, so please try again.",
  edit: "That picture couldn't be changed right now, so please try again.",
  noSpeech: "No words were heard in that recording, so please try again.",
};

const RECORDING_TOO_LONG = "That recording is too long to send, so try a shorter one.";

// Mirrors the distinct values of the mobile app's ai.models map.
const MODEL_ALLOWLIST = new Set(["openai/gpt-6-luna"]);
const DEFAULT_MODEL = "openai/gpt-6-luna";

// The pinned audio model of the moved transcribe transport.
const AI_AUDIO_MODEL = "qwen/qwen3-asr-0.6b";

// The base64 of the 3 MB audio cap plus the same slack the client allows.
const MAX_AUDIO_BASE64 = 4194404;

// One request to one model: a minute is generous, and the app owns the retry loop.
const AI_TIMEOUT_MS = 60000;
// One request per prompt per Borel call: image generation is slow on purpose.
const BOREL_TIMEOUT_MS = 150000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/**
 * Injected seams for createAiRouter. All default to the real implementations:
 * `getSession` calls better-auth's `auth.api.getSession({ headers })`,
 * `chatSend` calls the OpenRouter SDK's standalone function, and the two fetch
 * seams run the real `fetch` with their own timeout (AbortController race).
 */
export type AiSession = { user: { id: string } };

export type ChatSendSeam = (
  core: unknown,
  args: { chatRequest: ChatRequest },
  options?: Record<string, Loose>,
) => Promise<{ ok: boolean; error?: Loose; value?: Loose }>;

export type FetchSeam = (url: string, init: RequestInit, timeoutMs: number) => Promise<Response>;

export type AiRouterDeps = {
  getSession?: (headers: Headers) => Promise<AiSession | null>;
  chatSend?: ChatSendSeam;
  openrouterFetch?: FetchSeam;
  borelFetch?: FetchSeam;
};

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
function messageOf(json: Loose): string | null {
  if (!json || typeof json !== "object") return null;
  if (typeof json.error === "string") return json.error;
  if (json.error && typeof json.error.message === "string") return json.error.message;
  return typeof json.message === "string" ? json.message : null;
}

function refusalOf(status: number, json: Loose): AiRefusal | null {
  const reason = json && typeof json.reason === "string" ? json.reason : null;
  if (reason === "wallet_empty" || reason === "daily_allowance_used" || reason === "cloud_paused") return reason;
  if (status !== 402) return null;
  const text = json && typeof json.error === "string" ? json.error : "";
  if (/cloud is paused/i.test(text)) return "cloud_paused";
  if (/AI allowance/i.test(text)) return "daily_allowance_used";
  if (/AI is paused/i.test(text)) return "wallet_empty";
  return null;
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
function readJson(text: string | null): { ok: true; value: Loose } | { ok: false } {
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

/** The wire form the SDK expects: image and audio parts get the SDK's camelCase field names. */
function toOpenRouterMessages(messages: ChatMessage[]): ChatRequest["messages"] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const content = m.content.map((part) => {
      if (part.type === "text") return { type: "text" as const, text: part.text };
      if (part.type === "image_url") return { type: "image_url" as const, imageUrl: { url: part.image_url.url } };
      return { type: "input_audio" as const, inputAudio: { data: part.input_audio.data, format: part.input_audio.format || "m4a" } };
    });
    return { role: m.role, content };
  }) as ChatRequest["messages"];
}

/** The assistant's words, whether the model sent one string or a list of text parts. */
function assistantText(message: Loose): string | null {
  if (!message) return null;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    const joined = message.content.map((part: Loose) => (part && typeof part.text === "string" ? part.text : "")).join("");
    return joined || null;
  }
  return null;
}

/** The OpenRouter error's own words, wherever they sit (parsed body first, then the error message). */
function openRouterSaid(err: Loose): string | null {
  if (err && typeof err.body === "string" && err.body.trim()) {
    try {
      const said = messageOf(JSON.parse(err.body));
      if (said) return said;
    } catch {
      // Not JSON; fall through to the error's own message.
    }
  }
  return err && typeof err.message === "string" ? err.message : null;
}

/**
 * One plain sentence for an OpenRouter failure. Codes that mean a state the
 * learner cannot fix resolve to the app's standing sentences; any other code
 * shows the API's words only when they already read as one plain sentence.
 */
function openRouterSays(status: number, said: string | null): string {
  if (status === 402 || status === 404) return NEUTRAL_ERROR.wallet_empty;
  if (status === 403 || status === 429) return NEUTRAL_ERROR.daily_allowance_used;
  if (status === 401 || status === 502) return AI_SAYS.failed;
  return looksPlain(said) ? said.trim() : AI_SAYS.failed;
}

/** Whatever technical text the error carries, kept for whoever reads the code. */
function openRouterDetail(err: Loose, said: string | null): string | null {
  if (err && typeof err.body === "string" && err.body.trim()) return err.body;
  return said;
}

function transcribeFailure(error: string, status: number, detail: string | null = null): AiTranscribeResult {
  return { text: null, error, status, reason: null, detail };
}

/** The base64 behind a data: URL, or the string as it already stands. */
function base64Body(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  return comma === -1 ? data : data.slice(comma + 1);
}

/** The real OpenRouter fetch: one AbortController for the whole request budget. */
async function openrouterFetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The real Borel fetch: the request races its own timeout, which rejects as an AbortError. */
async function borelFetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

const BOREL_FORWARD_HEADERS: Array<[string, string]> = [
  ["authorization", "Authorization"],
  ["x-borel-surface", "X-Borel-Surface"],
  ["x-borel-build", "X-Borel-Build"],
];

async function jsonBody(c: Context): Promise<Loose> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function createAiRouter(deps: AiRouterDeps = {}): Hono {
  const getSession = deps.getSession ?? (async (headers: Headers): Promise<AiSession | null> => {
    const session = await auth.api.getSession({ headers });
    return session ? { user: { id: session.user.id } } : null;
  });
  const sendChat = deps.chatSend ?? (chatSend as unknown as ChatSendSeam);
  const fetchOpenRouter = deps.openrouterFetch ?? openrouterFetchWithTimeout;
  const fetchBorel = deps.borelFetch ?? borelFetchWithTimeout;

  let core: OpenRouterCore | null = null;
  function openRouterCore(): OpenRouterCore {
    if (!core) core = new OpenRouterCore({ apiKey: openRouterApiKey(), retryConfig: { strategy: "none" } });
    return core;
  }

  /** One request to OpenRouter's chat completions, settled with a plain sentence whatever happens. */
  async function chatOnce(body: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: ChatRequest["responseFormat"];
  }): Promise<AiChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const result = await sendChat(
        openRouterCore(),
        {
          chatRequest: {
            model: body.model,
            messages: toOpenRouterMessages(body.messages),
            temperature: body.temperature ?? undefined,
            maxTokens: body.max_tokens ?? undefined,
            responseFormat: body.response_format ?? undefined,
            provider: { only: ["openai"]},
          },
        },
        { signal: controller.signal, retries: { strategy: "none" } },
      );
      if (!result.ok) {
        const err: Loose = result.error;
        if (err && err.name === "RequestAbortedError") return chatFailure(AI_SAYS.slow, 0, { detail: err.message || null });
        if (err && err.name === "RequestTimeoutError") return chatFailure(AI_SAYS.slow, 0, { detail: err.message || null });
        if (err && err.name === "ConnectionError") return chatFailure(AI_SAYS.offline, 0, { detail: err.message || null });
        const status = err && typeof err.statusCode === "number" ? err.statusCode : 0;
        const said = openRouterSaid(err);
        return chatFailure(openRouterSays(status, said), status, { detail: openRouterDetail(err, said) });
      }
      const value: Loose = result.value;
      const choice = value && Array.isArray(value.choices) ? value.choices[0] : null;
      const content = assistantText(choice && choice.message);
      if (content == null) return chatFailure(AI_SAYS.failed, 200, { raw: value, detail: "The answer carried no text." });
      return {
        text: content,
        data: null,
        error: null,
        status: 200,
        reason: null,
        truncated: Boolean(choice && choice.finishReason === "length"),
        raw: value,
        detail: null,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return chatFailure(aborted ? AI_SAYS.slow : AI_SAYS.offline, 0, { detail: err instanceof Error ? err.message : null });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One request to OpenRouter's Speech-to-Text API. The endpoint takes only a
   * model and the audio bytes, so callers' `language` and `prompt` are dropped.
   */
  async function transcribeOnce(clip: { data: string; format: string }): Promise<AiTranscribeResult> {
    try {
      const res = await fetchOpenRouter(OPENROUTER_URL + "/audio/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + openRouterApiKey() },
        body: JSON.stringify({ model: AI_AUDIO_MODEL, input_audio: { data: base64Body(clip.data), format: clip.format || "m4a" } }),
      }, AI_TIMEOUT_MS);
      const json: Loose = await res.json().catch(() => null);
      if (!res.ok) {
        const said = messageOf(json);
        return transcribeFailure(openRouterSays(res.status, said), res.status, json ? JSON.stringify(json) : said);
      }
      const text = json && typeof json.text === "string" ? json.text.trim() : "";
      if (!text) return transcribeFailure(AI_SAYS.noSpeech, res.status, "The recording had no speech in it.");
      return { text, error: null, status: res.status, reason: null, detail: null };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return transcribeFailure(aborted ? AI_SAYS.slow : AI_SAYS.offline, 0, err instanceof Error ? err.message : null);
    }
  }

  /**
   * One Borel image call: a transparent proxy so Borel's metering, refusal
   * wording, and surface policy behave exactly as they do when the client
   * calls Borel directly.
   */
  async function imageProxy(path: string, payload: unknown, fallback: string, headers: Headers): Promise<AiImageResult> {
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

  const chatRouter = new Hono();
  chatRouter.post("/", async (c) => {
    try {
      const body = await jsonBody(c);
      if (!openRouterApiKey()) return c.json(chatFailure(AI_SAYS.failed, 0, { detail: "OPENROUTER_API_KEY is not set." }));
      const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
      if (!MODEL_ALLOWLIST.has(model)) {
        return c.json(chatFailure(AI_SAYS.badModel, 400, { detail: `model "${model}" is not on the allowlist` }));
      }
      const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
      const schema = body.jsonSchema;
      const jsonSchema: AiJsonSchema | undefined =
        schema && typeof schema === "object" && typeof schema.name === "string" && schema.schema && typeof schema.schema === "object"
          ? { name: schema.name, schema: schema.schema }
          : undefined;
      const response_format: ChatRequest["responseFormat"] | undefined = jsonSchema
        ? {
            type: "json_schema",
            jsonSchema: {
              name: jsonSchema.name,
              strict: true,
              schema: jsonSchema.schema,
            },
          }
        : undefined;
      const request = {
        model,
        messages,
        temperature: typeof body.temperature === "number" ? body.temperature : undefined,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
        response_format,
      };
      if (!jsonSchema) return c.json(await chatOnce(request));
      let last: AiChatResult = chatFailure(AI_SAYS.unreadable, 0);
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await chatOnce(request);
        if (r.error) return c.json(r);
        if (r.truncated) return c.json({ ...r, error: AI_SAYS.tooLong, detail: "The answer reached max_tokens and was cut off." });
        const read = readJson(r.text);
        if (read.ok) return c.json({ ...r, data: read.value });
        last = { ...r, error: AI_SAYS.unreadable, detail: "The answer was not valid JSON." };
      }
      return c.json(last);
    } catch (err) {
      return c.json(chatFailure(AI_SAYS.failed, 0, { detail: err instanceof Error ? err.message : null }));
    }
  });

  const transcribeRouter = new Hono();
  transcribeRouter.post("/", async (c) => {
    try {
      if (!openRouterApiKey()) return c.json(transcribeFailure(AI_SAYS.failed, 0, "OPENROUTER_API_KEY is not set."));
      const body = await jsonBody(c);
      const audio = body.audio && typeof body.audio === "object" ? body.audio : {};
      const clip = {
        data: typeof audio.data === "string" ? audio.data : "",
        format: typeof audio.format === "string" ? audio.format : "",
      };
      const stripped = base64Body(clip.data);
      if (stripped.length > MAX_AUDIO_BASE64) return c.json(transcribeFailure(RECORDING_TOO_LONG, 0, "The recording exceeded the 3 MB audio cap."));
      if (!stripped.trim()) return c.json(transcribeFailure(AI_SAYS.noSpeech, 0, "The recording had no audio in it."));
      return c.json(await transcribeOnce(clip));
    } catch (err) {
      return c.json(transcribeFailure(AI_SAYS.failed, 0, err instanceof Error ? err.message : null));
    }
  });

  const generationRouter = new Hono();
  generationRouter.post("/", async (c) => {
    try {
      if (!borelAiUrl()) return c.json({ url: null, error: AI_SAYS.picture, status: 0, reason: null, reused: null } satisfies AiImageResult);
      const body = await jsonBody(c);
      return c.json(await imageProxy("/images/generations", { prompt: body.prompt, size: body.size }, AI_SAYS.picture, c.req.raw.headers));
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return c.json({ url: null, error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline, status: 0, reason: null, reused: null } satisfies AiImageResult);
    }
  });

  const editRouter = new Hono();
  editRouter.post("/", async (c) => {
    try {
      if (!borelAiUrl()) return c.json({ url: null, error: AI_SAYS.edit, status: 0, reason: null, reused: null } satisfies AiImageResult);
      const body = await jsonBody(c);
      return c.json(await imageProxy("/images/edits", { image: body.image, prompt: body.prompt, size: body.size }, AI_SAYS.edit, c.req.raw.headers));
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return c.json({ url: null, error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline, status: 0, reason: null, reused: null } satisfies AiImageResult);
    }
  });

  const router = new Hono();
  router.use("*", async (c, next) => {
    let session: AiSession | null;
    try {
      session = (await getSession(c.req.raw.headers)) ?? null;
    } catch {
      // A session lookup that cannot run leaves the caller signed out.
      session = null;
    }
    if (!session) return c.json({ error: "You need to sign in first." }, 401);
    await next();
  });
  router.route("/chat", chatRouter);
  router.route("/transcribe", transcribeRouter);
  router.route("/images/generations", generationRouter);
  router.route("/images/edits", editRouter);
  return router;
}
