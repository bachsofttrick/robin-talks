import { Hono } from "hono";
import { OpenRouterCore } from "@openrouter/sdk/core";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import type { ChatRequest } from "@openrouter/sdk/models";
import { openRouterApiKey } from "../../lib/env.js";
import {
  AI_SAYS,
  AI_TIMEOUT_MS,
  DEFAULT_MODEL,
  MODEL_ALLOWLIST,
  jsonBody,
  messageOf,
  openRouterSays,
  type AiChatResult,
  type AiJsonSchema,
  type ChatMessage,
  type ChatSendSeam,
  type Loose,
} from "../../lib/ai/index.js";

const sendChat = chatSend as unknown as ChatSendSeam;

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

/** Whatever technical text the error carries, kept for whoever reads the code. */
function openRouterDetail(err: Loose, said: string | null): string | null {
  if (err && typeof err.body === "string" && err.body.trim()) return err.body;
  return said;
}

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

export const chatRouter = new Hono();

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
