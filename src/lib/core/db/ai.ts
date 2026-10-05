import { BOREL_AI, IN_BROWSER, OPENROUTER_API_KEY } from "./config";
import { postToParent, refusalOf, noteRefusal, looksPlain, messageOf, AiRefusal } from "./errors";
import { askAiConsent, AI_DECLINED, AI_AUDIO_MODEL } from "./consent";
import { borelFetch } from "./notify";
import { OpenRouterCore } from "@openrouter/sdk/core";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import type { ChatRequest } from "@openrouter/sdk/models";

const NEUTRAL_ERROR: Record<AiRefusal, string> = {
  wallet_empty: "AI isn't available right now, so please try again later.",
  daily_allowance_used: "AI has reached today's limit, so it's back tomorrow.",
  cloud_paused: "This isn't available right now, so please try again later.",
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

/** One request to one model: a minute is generous, and the app owns the retry loop. */
const AI_TIMEOUT_MS = 60000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_OPTIONS = { retries: { strategy: "none" } } as const;
// One client for the whole app; retries stay off because chat's JSON loop retries on its own.
const openRouter = new OpenRouterCore({ apiKey: OPENROUTER_API_KEY, retryConfig: { strategy: "none" } });

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
function assistantText(message: any): string | null {
  if (!message) return null;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    const joined = message.content.map((part: any) => (part && typeof part.text === "string" ? part.text : "")).join("");
    return joined || null;
  }
  return null;
}

/** The OpenRouter error's own words, wherever they sit (parsed body first, then the error message). */
function openRouterSaid(err: any): string | null {
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
function openRouterDetail(err: any, said: string | null): string | null {
  if (err && typeof err.body === "string" && err.body.trim()) return err.body;
  return said;
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
    const result = await chatSend(
      openRouter,
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
      { signal: controller.signal, ...OPENROUTER_OPTIONS },
    );
    if (!result.ok) {
      const err: any = result.error;
      if (err && err.name === "RequestAbortedError") return chatFailure(AI_SAYS.slow, 0, { detail: err.message || null });
      if (err && err.name === "RequestTimeoutError") return chatFailure(AI_SAYS.slow, 0, { detail: err.message || null });
      if (err && err.name === "ConnectionError") return chatFailure(AI_SAYS.offline, 0, { detail: err.message || null });
      const status = err && typeof err.statusCode === "number" ? err.statusCode : 0;
      const said = openRouterSaid(err);
      return chatFailure(openRouterSays(status, said), status, { detail: openRouterDetail(err, said) });
    }
    const value: any = result.value;
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
 * What db.ai.transcribe resolves. `text` is what was said, and null exactly
 * when `error` is set; `error` is one sentence to show; `detail` is for
 * whoever reads the code.
 */
export type AiTranscribeResult = { text: string | null; error: string | null; status: number; reason: AiRefusal | null; detail: string | null };

function transcribeFailure(error: string, status: number, detail: string | null = null): AiTranscribeResult {
  return { text: null, error, status, reason: null, detail };
}

/** The base64 behind a data: URL, or the string as it already stands. */
function base64Body(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  return comma === -1 ? data : data.slice(comma + 1);
}

/**
 * One request to OpenRouter's Speech-to-Text API. The endpoint takes only a
 * model and the audio bytes, so callers' `language` and `prompt` are dropped.
 */
async function transcribeOnce(clip: { data: string; format: string }): Promise<AiTranscribeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL + "/audio/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + OPENROUTER_API_KEY },
      body: JSON.stringify({ model: AI_AUDIO_MODEL, input_audio: { data: base64Body(clip.data), format: clip.format || "m4a" } }),
      signal: controller.signal,
    });
    const json: any = await res.json().catch(() => null);
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
  } finally {
    clearTimeout(timer);
  }
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
  models: { fast: "openai/gpt-6-luna", smart: "openai/gpt-6-luna" },
  // json: true asks for JSON only and reads the reply into data (fences and
  // words around it are fine); pass a schema to force the reply through
  // OpenRouter's structured outputs; an answer that can't be read is asked for
  // once more.
  async chat(input: { model?: string; messages: ChatMessage[]; temperature?: number; max_tokens?: number; jsonSchema?: AiJsonSchema }): Promise<AiChatResult> {
    try {
      if (!OPENROUTER_API_KEY) return chatFailure(AI_SAYS.failed, 0, { detail: "EXPO_PUBLIC_OPENROUTER_API_KEY is not set." });
      const withPhoto = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "image_url"));
      const withAudio = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "input_audio"));
      if (!(await askAiConsent(withAudio ? "audio" : withPhoto ? "photoChat" : "chat", input.model || ai.models.fast))) {
        return chatFailure(AI_DECLINED, 0);
      }
      // A photo from the device becomes something OpenRouter can read before it is sent.
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
      const schema = input.jsonSchema;
      const response_format: ChatRequest["responseFormat"] | undefined = schema
        ? {
            type: "json_schema",
            jsonSchema: {
              name: schema.name,
              strict: true,
              schema: schema.schema
            },
          }
        : undefined;
      const body = {
        model: input.model || ai.models.fast,
        messages,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
        response_format,
      };
      if (!input.jsonSchema) return await chatOnce(body);
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
      if (!OPENROUTER_API_KEY) return transcribeFailure(AI_SAYS.failed, 0, "EXPO_PUBLIC_OPENROUTER_API_KEY is not set.");
      let clip: { data: string; format: string };
      try {
        clip = await sendableAudio(input ? input.audio : null);
      } catch (err) {
        const detail = err instanceof Error ? err.message : null;
        const said = detail === NO_RECORDING || detail === RECORDING_TOO_LONG ? detail : RECORDING_UNREADABLE;
        return transcribeFailure(said, 0, detail);
      }
      if (!(await askAiConsent("audio", AI_AUDIO_MODEL))) return transcribeFailure(AI_DECLINED, 0);
      return await transcribeOnce(clip);
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
