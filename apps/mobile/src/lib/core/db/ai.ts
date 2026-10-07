import { BACKEND_AI_URL, IN_BROWSER, borelHeaders } from "./config";
import { postToParent, noteRefusal, messageOf } from "./errors";
import type { AiRefusal } from "./errors";
import { askAiConsent, AI_DECLINED, AI_AUDIO_MODEL } from "./consent";
import { sessionCookieHeader, authHeader } from "./auth";

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
const EMPTY_RECORDING = "empty-recording";
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
  throw new Error(EMPTY_RECORDING);
}

const AI_SAYS = {
  offline: "Couldn't reach the AI, so check your connection and try again.",
  slow: "The AI took too long to answer, so please try again.",
  pictureSlow: "The picture took too long, so please try again.",
  failed: "The AI couldn't answer that right now, so please try again.",
  photo: "That photo couldn't be read, so try picking it again.",
  back: "Sign in to use this feature.",
  noBackend: "The backend is not configured.",
  transcribe: "Couldn't write down that recording right now, so please try again.",
  noSpeech: "No words were heard in that recording, so please try again.",
};

// The provider's own 60s/150s budgets plus the client's margin.
const CHAT_TIMEOUT_MS = 65000;
const IMAGE_TIMEOUT_MS = 160000;

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

/**
 * What db.ai.transcribe resolves. `text` is what was said, and null exactly
 * when `error` is set; `error` is one sentence to show; `detail` is for
 * whoever reads the code.
 */
export type AiTranscribeResult = { text: string | null; error: string | null; status: number; reason: AiRefusal | null; detail: string | null };

function chatFailure(error: string, status: number, extra: Partial<AiChatResult> = {}): AiChatResult {
  return { text: null, data: null, error, status, reason: null, truncated: false, raw: null, detail: null, ...extra };
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

/**
 * What db.ai.image and db.ai.editImage resolve. `url` is null exactly when
 * `error` is set; `error` is one sentence to show.
 */
export type AiImageResult = { url: string | null; error: string | null; status: number; reason: AiRefusal | null };

// One POST to one /api/ai endpoint: the reply parsed, or the transport-level
// failure mapped to its sentence (unset config, timeout, network, 401).
type AiReply = { status: number; json: any; error: string | null };

async function aiRequest(path: string, body: unknown, timeoutMs: number, slow: string, withBorelHeaders: boolean): Promise<AiReply> {
  if (!BACKEND_AI_URL) return { status: 0, json: null, error: AI_SAYS.noBackend };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error(slow);
      err.name = "AbortError";
      reject(err);
    }, timeoutMs);
  });
  const request = (async () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (withBorelHeaders) {
      Object.assign(headers, borelHeaders());
      const bearer = await authHeader();
      if (bearer) headers.Authorization = "Bearer " + bearer;
    }
    if (IN_BROWSER) {
      return await fetch(BACKEND_AI_URL + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        credentials: "include",
        signal: controller.signal,
      });
    }
    const cookie = await sessionCookieHeader();
    if (cookie) headers.Cookie = cookie;
    return await fetch(BACKEND_AI_URL + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
      signal: controller.signal,
    });
  })();
  try {
    const res = await Promise.race([request, timedOut]);
    const json: any = await res.json().catch(() => null);
    if (res.status === 401) return { status: res.status, json, error: messageOf(json) || AI_SAYS.back };
    if (!res.ok) return { status: res.status, json, error: AI_SAYS.offline };
    return { status: res.status, json, error: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { status: 0, json: null, error: aborted ? slow : AI_SAYS.offline };
  } finally {
    clearTimeout(timer);
  }
}

function asRefusal(json: any): AiRefusal | null {
  const reason = json && typeof json.reason === "string" ? json.reason : null;
  return reason === "wallet_empty" || reason === "daily_allowance_used" || reason === "cloud_paused" ? reason : null;
}

/**
 * One request per prompt per session, and one in flight at a time.
 *
 * Borel stores a generated image under a key derived from its prompt, so
 * asking twice is already free and instant. This is the layer above that: two
 * components mounting at once (or React re-running an effect) would otherwise
 * fire two requests for the same picture, and the first one would still be
 * generating when the second arrived to find nothing stored yet. Sharing the
 * promise makes that call. Failures are dropped so a retry is possible.
 */
const inFlightImages = new Map<string, Promise<AiImageResult>>();

export const ai = {
  /** Curated ids. Do not invent others. Both answer today; "smart" is a stronger model for harder asks. */
  models: { fast: "openai/gpt-6-luna", smart: "openai/gpt-6-luna" },
  // The backend reads the reply as JSON when a schema is passed, retrying once
  // and wording a cut-off answer; the app only forwards the schema.
  async chat(input: { model?: string; messages: ChatMessage[]; temperature?: number; max_tokens?: number; jsonSchema?: AiJsonSchema }): Promise<AiChatResult> {
    try {
      const model = input.model || ai.models.fast;
      const withPhoto = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "image_url"));
      const withAudio = input.messages.some((m) => typeof m.content !== "string" && m.content.some((part) => part.type === "input_audio"));
      if (!(await askAiConsent(withAudio ? "audio" : withPhoto ? "photoChat" : "chat", model))) {
        return chatFailure(AI_DECLINED, 0);
      }
      // A photo from the device becomes something the backend can read before it is sent.
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
      const reply = await aiRequest(
        "/chat",
        { model, messages, temperature: input.temperature, max_tokens: input.max_tokens, jsonSchema: input.jsonSchema },
        CHAT_TIMEOUT_MS,
        AI_SAYS.slow,
        false,
      );
      if (reply.error) return chatFailure(reply.error, reply.status);
      const body = reply.json && typeof reply.json === "object" ? reply.json : {};
      return {
        text: typeof body.text === "string" ? body.text : null,
        data: body.data ?? null,
        error: typeof body.error === "string" ? body.error : null,
        status: typeof body.status === "number" ? body.status : reply.status,
        reason: asRefusal(body),
        truncated: Boolean(body.truncated),
        raw: body.raw ?? null,
        detail: typeof body.detail === "string" ? body.detail : null,
      };
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
        if (detail === EMPTY_RECORDING) return transcribeFailure(AI_SAYS.noSpeech, 0, detail);
        const said = detail === NO_RECORDING || detail === RECORDING_TOO_LONG ? detail : RECORDING_UNREADABLE;
        return transcribeFailure(said, 0, detail);
      }
      if (!base64Body(clip.data).trim()) return transcribeFailure(AI_SAYS.noSpeech, 0, "The recording had no audio in it.");
      if (!(await askAiConsent("audio", AI_AUDIO_MODEL))) return transcribeFailure(AI_DECLINED, 0);
      const reply = await aiRequest("/transcribe", { audio: { data: clip.data, format: clip.format } }, CHAT_TIMEOUT_MS, AI_SAYS.slow, false);
      if (reply.error) return transcribeFailure(reply.error, reply.status);
      const body = reply.json && typeof reply.json === "object" ? reply.json : {};
      return {
        text: typeof body.text === "string" ? body.text : null,
        error: typeof body.error === "string" ? body.error : null,
        status: typeof body.status === "number" ? body.status : reply.status,
        reason: null,
        detail: typeof body.detail === "string" ? body.detail : null,
      };
    } catch (err) {
      return transcribeFailure(AI_SAYS.transcribe, 0, err instanceof Error ? err.message : null);
    }
  },
  // Generate an image from a text prompt. Borel makes the picture, stores it
  // in this app's files, and hands back a ready image URL; the backend
  // forwards the request to Borel, so the app sends no provider key.
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
        const reply = await aiRequest("/images/generations", { prompt: input.prompt, size: input.size }, IMAGE_TIMEOUT_MS, AI_SAYS.pictureSlow, true);
        if (reply.error) return { url: null, error: reply.error, status: reply.status, reason: null };
        const body = reply.json && typeof reply.json === "object" ? reply.json : {};
        if (IN_BROWSER && body.reused !== true) postToParent({ type: "ai:metered" });
        const reason = asRefusal(body);
        if (reason) noteRefusal(reason);
        return {
          url: typeof body.url === "string" ? body.url : null,
          error: typeof body.error === "string" ? body.error : null,
          status: typeof body.status === "number" ? body.status : reply.status,
          reason,
        };
      } catch {
        return {
          url: null,
          error: AI_SAYS.offline,
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
      let image: string;
      try {
        image = await sendableImage(input.image);
      } catch (err) {
        const detail = err instanceof Error ? err.message : null;
        return { url: null, error: detail === NO_PHOTO ? NO_PHOTO : AI_SAYS.offline, status: 0, reason: null };
      }
      const reply = await aiRequest("/images/edits", { image, prompt: input.prompt, size: input.size }, IMAGE_TIMEOUT_MS, AI_SAYS.pictureSlow, true);
      if (reply.error) return { url: null, error: reply.error, status: reply.status, reason: null };
      const body = reply.json && typeof reply.json === "object" ? reply.json : {};
      if (IN_BROWSER && body.reused !== true) postToParent({ type: "ai:metered" });
      const reason = asRefusal(body);
      if (reason) noteRefusal(reason);
      return {
        url: typeof body.url === "string" ? body.url : null,
        error: typeof body.error === "string" ? body.error : null,
        status: typeof body.status === "number" ? body.status : reply.status,
        reason,
      };
    } catch {
      return { url: null, error: AI_SAYS.offline, status: 0, reason: null };
    }
  },
};
