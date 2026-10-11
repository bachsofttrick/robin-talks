import type { AiRefusal } from "./types.js";

export const NEUTRAL_ERROR: Record<AiRefusal, string> = {
  wallet_empty: "AI isn't available right now, so please try again later.",
  daily_allowance_used: "AI has reached today's limit, so it's back tomorrow.",
  cloud_paused: "This isn't available right now, so please try again later.",
};

export const AI_SAYS = {
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

export const RECORDING_TOO_LONG = "That recording is too long to send, so try a shorter one.";

// Mirrors the distinct values of the mobile app's ai.models map.
export const MODEL_ALLOWLIST = new Set(["openai/gpt-6-luna"]);
export const DEFAULT_MODEL = "openai/gpt-6-luna";

// The pinned audio model of the moved transcribe transport.
export const AI_AUDIO_MODEL = "google/gemini-3.5-transcribe";

// The base64 of the 3 MB audio cap plus the same slack the client allows.
export const MAX_AUDIO_BASE64 = 4194404;

// One request to one model: a minute is generous, and the app owns the retry loop.
export const AI_TIMEOUT_MS = 60000;
// One request per prompt per Borel call: image generation is slow on purpose.
export const BOREL_TIMEOUT_MS = 150000;

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export const BOREL_FORWARD_HEADERS: Array<[string, string]> = [
  ["authorization", "Authorization"],
  ["x-borel-surface", "X-Borel-Surface"],
  ["x-borel-build", "X-Borel-Build"],
];

export const CODE_CHARACTERS = '"{}<>[]/@_=;|#$%^*~+';

export const TECHNICAL_WORDS = new Set([
  "json", "api", "apis", "null", "undefined", "token", "tokens", "http", "https", "url", "urls", "quota", "billing",
  "schema", "sql", "server", "endpoint", "payload", "gateway", "status", "model", "models", "exception", "stack",
  "parse", "invalid", "upstream", "error", "errors", "code", "org", "id", "rls", "postgres", "postgrest", "policy",
]);
