import type { ChatRequest } from "@openrouter/sdk/models";

// Provider bodies and SDK results are read loosely, as the moved transport did.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

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
