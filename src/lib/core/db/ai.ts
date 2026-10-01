import { BOREL_AI, IN_BROWSER } from "./config";
import { postToParent, refusalOf, noteRefusal, looksPlain, messageOf, AiRefusal } from "./errors";
import { askAiConsent, AI_DECLINED, AI_AUDIO_MODEL } from "./consent";
import { authHeader } from "./auth";
import { borelFetch } from "./notify";

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
