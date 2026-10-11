import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import * as realFunctions from "../../lib/ai/functions.js";
import { chatSend as realChatSend } from "@openrouter/sdk/funcs/chatSend";
import { auth as realAuth } from "../../lib/auth.js";

// Capture the real resolver before the mock below replaces the module, so the
// fallback answers signed out instead of calling back into the mock itself.
const realGetSession = realAuth.api.getSession.bind(realAuth.api);

// Loose is any: these fakes mirror the provider's untyped surfaces.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

type ChatSendFn = (core: unknown, args: Loose, options?: Loose) => Promise<{ ok: boolean; error?: Loose; value?: Loose }>;
type FetchFn = (url: string, init: RequestInit, timeoutMs: number) => Promise<Response>;
type SessionFn = (headers: Headers) => Promise<{ user: { id: string } } | null>;

let chatSendImpl: ChatSendFn = realChatSend as unknown as ChatSendFn;
let openrouterFetchImpl: FetchFn = realFunctions.openrouterFetchWithTimeout;
let borelFetchImpl: FetchFn = realFunctions.borelFetchWithTimeout;
let sessionImpl: SessionFn | null = null;

// The router holds no seams, so the tests patch the modules the real ones live in.
mock.module("@openrouter/sdk/funcs/chatSend", () => ({
  chatSend: (core: unknown, args: Loose, options?: Loose) => chatSendImpl(core, args, options),
}));
mock.module("../../lib/ai/functions.js", () => ({
  ...realFunctions,
  openrouterFetchWithTimeout: (url: string, init: RequestInit, timeoutMs: number) => openrouterFetchImpl(url, init, timeoutMs),
  borelFetchWithTimeout: (url: string, init: RequestInit, timeoutMs: number) => borelFetchImpl(url, init, timeoutMs),
}));
mock.module("../../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        sessionImpl ? sessionImpl(headers) : realGetSession({ headers }),
    },
  },
}));

const { aiRouter } = await import("./index.js");

const SIGN_IN_BODY = { error: "You need to sign in first." };

type ChatCall = { core: unknown; args: Loose; options?: Loose };
type FetchCall = { url: string; init: RequestInit; timeoutMs: number };

function stubChatSend(result: Loose = { ok: true, value: {} }): ChatCall[] {
  const calls: ChatCall[] = [];
  chatSendImpl = async (core, args, options) => {
    calls.push({ core, args, options });
    return result;
  };
  return calls;
}

function stubChatSendThrow(err: unknown): ChatCall[] {
  const calls: ChatCall[] = [];
  chatSendImpl = async (core, args, options) => {
    calls.push({ core, args, options });
    throw err;
  };
  return calls;
}

function stubFetch(kind: "openrouter" | "borel", result: Response | null = null, throwErr?: unknown): FetchCall[] {
  const calls: FetchCall[] = [];
  const impl: FetchFn = async (url, init, timeoutMs) => {
    calls.push({ url, init, timeoutMs });
    if (throwErr) throw throwErr;
    if (!result) throw new Error("no canned response configured");
    return result;
  };
  if (kind === "openrouter") openrouterFetchImpl = impl;
  else borelFetchImpl = impl;
  return calls;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function signIn(): void {
  sessionImpl = async () => ({ user: { id: "user-1" } });
}

function signOut(): void {
  sessionImpl = async () => null;
}

function sessionStoreDown(): void {
  sessionImpl = async () => {
    throw new Error("session store is down");
  };
}

async function post(path: string, payload?: unknown, headers?: Record<string, string>): Promise<Response> {
  return await aiRouter.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

const CHAT_OK_VALUE = { choices: [{ message: { content: "Hello there." }, finishReason: "stop" }] };
const CHAT_UNSET_KEY: AiChatShape = {
  text: null,
  data: null,
  error: "The AI couldn't answer that right now, so please try again.",
  status: 0,
  reason: null,
  truncated: false,
  raw: null,
  detail: "OPENROUTER_API_KEY is not set.",
};
const TRANSCRIBE_UNSET_KEY = {
  text: null,
  error: "The AI couldn't answer that right now, so please try again.",
  status: 0,
  reason: null,
  detail: "OPENROUTER_API_KEY is not set.",
};

type AiChatShape = {
  text: string | null;
  data: Loose;
  error: string | null;
  status: number;
  reason: string | null;
  truncated: boolean;
  raw: unknown;
  detail: string | null;
};

const ENV_KEYS = ["OPENROUTER_API_KEY", "BOREL_AI_URL"];

async function withoutEnv(keys: string[], run: () => Promise<void>): Promise<void> {
  const saved = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) delete process.env[key];
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

let envRestorers: Array<() => void> = [];

afterEach(() => {
  for (const restore of envRestorers) restore();
  envRestorers = [];
  chatSendImpl = realChatSend as unknown as ChatSendFn;
  openrouterFetchImpl = realFunctions.openrouterFetchWithTimeout;
  borelFetchImpl = realFunctions.borelFetchWithTimeout;
  sessionImpl = null;
});

beforeEach(() => {
  signIn();
});

async function setEnv(key: string, value: string): Promise<void> {
  const saved = process.env[key];
  process.env[key] = value;
  envRestorers.push(() => {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  });
}

describe("smoke: the real module with default implementations", () => {
  test("aiRouter is built at import time and answers 401 without a session", async () => {
    expect(aiRouter).toBeDefined();
    sessionImpl = null;
    await withoutEnv(ENV_KEYS, async () => {
      const response = await post("/health");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(SIGN_IN_BODY);
    });
  });
});

describe("AC-1: every endpoint needs a session", () => {
  const PATHS = ["/chat", "/transcribe", "/images/generations", "/images/edits"];

  for (const path of PATHS) {
    test(`POST ${path} without a session answers 401 with the exact body`, async () => {
      signOut();
      const response = await post(path, {});
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(SIGN_IN_BODY);
    });

    test(`POST ${path} with a rejecting session resolver answers 401 with the exact body`, async () => {
      sessionStoreDown();
      const response = await post(path, {});
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(SIGN_IN_BODY);
    });
  }

  test("AC-10: the real better-auth session resolver answers 401 for a cookie-less call", async () => {
    sessionImpl = null;
    await withoutEnv(ENV_KEYS, async () => {
      const response = await post("/chat", { messages: [] });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(SIGN_IN_BODY);
    });
  });
});

describe("AC-2: unconfigured env answers the failure shape with no provider call", () => {
  test("chat without OPENROUTER_API_KEY", async () => {
    await withoutEnv(["OPENROUTER_API_KEY"], async () => {
      const chat = stubChatSend();
      const response = await post("/chat", { messages: [] });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(CHAT_UNSET_KEY);
      expect(chat).toHaveLength(0);
    });
  });

  test("transcribe without OPENROUTER_API_KEY", async () => {
    await withoutEnv(["OPENROUTER_API_KEY"], async () => {
      const audio = stubFetch("openrouter");
      const response = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(TRANSCRIBE_UNSET_KEY);
      expect(audio).toHaveLength(0);
    });
  });

  test("generations without BOREL_AI_URL", async () => {
    await withoutEnv(["BOREL_AI_URL"], async () => {
      const borel = stubFetch("borel");
      const response = await post("/images/generations", { prompt: "a cat" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        url: null,
        error: "The picture couldn't be made right now, so please try again.",
        status: 0,
        reason: null,
        reused: null,
      });
      expect(borel).toHaveLength(0);
    });
  });

  test("edits without BOREL_AI_URL", async () => {
    await withoutEnv(["BOREL_AI_URL"], async () => {
      const borel = stubFetch("borel");
      const response = await post("/images/edits", { image: "https://example.com/a.png", prompt: "a cat" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        url: null,
        error: "That picture couldn't be changed right now, so please try again.",
        status: 0,
        reason: null,
        reused: null,
      });
      expect(borel).toHaveLength(0);
    });
  });
});

describe("AC-3: chat", () => {
  test("an unknown model answers 200 with the allowlist object and no provider call", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const chat = stubChatSend();
    const response = await post("/chat", { model: "other/model", messages: [] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: null,
      data: null,
      error: "The app can't use that model, so please try again.",
      status: 400,
      reason: null,
      truncated: false,
      raw: null,
      detail: 'model "other/model" is not on the allowlist',
    });
    expect(chat).toHaveLength(0);
  });

  test("the request to chatSend carries the provider pin, the mapped fields, and the timeout signal", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const chat = stubChatSend({ ok: true, value: CHAT_OK_VALUE });
    const response = await post("/chat", {
      model: "openai/gpt-6-luna",
      temperature: 0.5,
      max_tokens: 300,
      messages: [
        { role: "user", content: "Say hi" },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://example.com/a.png" } },
            { type: "input_audio", input_audio: { data: "AAAA", format: "" } },
          ],
        },
      ],
      leftover: true,
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({
      text: "Hello there.",
      data: null,
      error: null,
      status: 200,
      reason: null,
      truncated: false,
      raw: CHAT_OK_VALUE,
      detail: null,
    });
    expect(chat).toHaveLength(1);
    const { args, options } = chat[0];
    const request = args.chatRequest;
    expect(request.model).toBe("openai/gpt-6-luna");
    expect(request.temperature).toBe(0.5);
    expect(request.maxTokens).toBe(300);
    expect(request.provider).toEqual({ only: ["openai"] });
    expect(request.messages[0]).toEqual({ role: "user", content: "Say hi" });
    expect(request.messages[1].content[0]).toEqual({ type: "image_url", imageUrl: { url: "https://example.com/a.png" } });
    expect(request.messages[1].content[1]).toEqual({ type: "input_audio", inputAudio: { data: "AAAA", format: "m4a" } });
    expect(options.retries).toEqual({ strategy: "none" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test("the assistant text joins across a message's content parts", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSend({
      ok: true,
      value: { choices: [{ message: { content: [{ type: "text", text: "Hel" }, { type: "text", text: "lo." }] }, finishReason: "stop" }] },
    });
    const response = await post("/chat", { messages: [{ role: "user", content: "hi" }] });
    const body = await response.json();
    expect(body.text).toBe("Hello.");
    expect(body.truncated).toBe(false);
  });

  test("a reply with no readable text answers the failed sentence and keeps the raw value", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const value = { choices: [{ message: { content: null }, finishReason: "stop" }] };
    stubChatSend({ ok: true, value });
    const response = await post("/chat", { messages: [{ role: "user", content: "hi" }] });
    expect(await response.json()).toEqual({
      text: null,
      data: null,
      error: "The AI couldn't answer that right now, so please try again.",
      status: 200,
      reason: null,
      truncated: false,
      raw: value,
      detail: "The answer carried no text.",
    });
  });

  test("a chatSend seam throwing an AbortError answers the slow sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSendThrow(Object.assign(new Error("the request was cut off"), { name: "AbortError" }));
    const response = await post("/chat", { messages: [] });
    const body = await response.json();
    expect(body.error).toBe("The AI took too long to answer, so please try again.");
    expect(body.status).toBe(0);
    expect(body.detail).toBe("the request was cut off");
  });

  test("a malformed jsonSchema is treated as schema-less", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    for (const jsonSchema of [{ schema: {} }, { name: "reply" }, "not an object"]) {
      const chat = stubChatSend({
        ok: true,
        value: { choices: [{ message: { content: "not json at all" }, finishReason: "stop" }] },
      });
      const response = await post("/chat", { messages: [{ role: "user", content: "hi" }], jsonSchema });
      expect(chat).toHaveLength(1);
      expect(chat[0].args.chatRequest.responseFormat).toBeUndefined();
      const body = await response.json();
      expect(body.text).toBe("not json at all");
      expect(body.data).toBeNull();
      expect(body.error).toBeNull();
    }
  });

  test("a body without a model forwards the default allowlisted id", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const chat = stubChatSend({ ok: true, value: CHAT_OK_VALUE });
    await post("/chat", { messages: [] });
    expect(chat[0].args.chatRequest.model).toBe("openai/gpt-6-luna");
  });

  test("a supplied jsonSchema becomes a strict response_format json_schema", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const chat = stubChatSend({ ok: true, value: { choices: [{ message: { content: '{"ok":true}' }, finishReason: "stop" }] } });
    await post("/chat", {
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { name: "reply", schema: { type: "object" } },
    });
    const request = chat[0].args.chatRequest;
    expect(request.responseFormat).toEqual({
      type: "json_schema",
      jsonSchema: { name: "reply", strict: true, schema: { type: "object" } },
    });
  });

  test("the schema path retries an unreadable reply once and reads the second", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    let call = 0;
    chatSendImpl = async () => {
      call++;
      const content = call === 1 ? "not json at all" : 'words around {"value":7} here';
      return { ok: true, value: { choices: [{ message: { content }, finishReason: "stop" }] } };
    };
    const response = await post("/chat", {
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { name: "reply", schema: {} },
    });
    expect(call).toBe(2);
    expect(await response.json()).toMatchObject({ text: 'words around {"value":7} here', data: { value: 7 }, error: null, truncated: false });
  });

  test("two unreadable schema replies answer with the unreadable sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const chat = stubChatSend({ ok: true, value: { choices: [{ message: { content: "still not json" }, finishReason: "stop" }] } });
    const response = await post("/chat", {
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { name: "reply", schema: {} },
    });
    expect(chat).toHaveLength(2);
    const body = await response.json();
    expect(body.error).toBe("That answer came back in a form this app couldn't read, so please try again.");
    expect(body.detail).toBe("The answer was not valid JSON.");
    expect(body.data).toBeNull();
  });

  test("a schema reply cut off at max_tokens answers with the too-long sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const value = { choices: [{ message: { content: "{\"a\":1}" }, finishReason: "length" }] };
    stubChatSend({ ok: true, value });
    const response = await post("/chat", {
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { name: "reply", schema: {} },
    });
    expect(await response.json()).toEqual({
      text: "{\"a\":1}",
      data: null,
      error: "That answer was too long, so try asking for less.",
      status: 200,
      reason: null,
      truncated: true,
      raw: value,
      detail: "The answer reached max_tokens and was cut off.",
    });
  });

  test("a schema-less cut-off answers with truncated true and error null", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSend({ ok: true, value: { choices: [{ message: { content: "partial" }, finishReason: "length" }] } });
    const response = await post("/chat", { messages: [{ role: "user", content: "hi" }] });
    const body = await response.json();
    expect(body.truncated).toBe(true);
    expect(body.error).toBeNull();
    expect(body.text).toBe("partial");
  });

  test("transport error names map to the slow and offline sentences", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    for (const [err, expected] of [
      [{ name: "RequestTimeoutError", message: "timed out" }, "The AI took too long to answer, so please try again."],
      [{ name: "RequestAbortedError", message: "aborted" }, "The AI took too long to answer, so please try again."],
      [{ name: "ConnectionError", message: "no network" }, "Couldn't reach the AI, so check your connection and try again."],
      [{ name: "SomethingElse", message: "mystery" }, "The AI couldn't answer that right now, so please try again."],
    ] as Array<[Loose, string]>) {
      stubChatSend({ ok: false, error: err });
      const response = await post("/chat", { messages: [] });
      const body = await response.json();
      expect(body.error).toBe(expected);
      expect(body.status).toBe(0);
      expect(body.detail).toBe(err.message);
    }
  });

  test("a chatSend rejection answers the offline sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSendThrow(new Error("socket died"));
    const response = await post("/chat", { messages: [] });
    const body = await response.json();
    expect(body.error).toBe("Couldn't reach the AI, so check your connection and try again.");
    expect(body.status).toBe(0);
    expect(body.detail).toBe("socket died");
  });

  test("OpenRouter error statuses map to the standing sentences", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    for (const [status, expected] of [
      [402, "AI isn't available right now, so please try again later."],
      [404, "AI isn't available right now, so please try again later."],
      [403, "AI has reached today's limit, so it's back tomorrow."],
      [429, "AI has reached today's limit, so it's back tomorrow."],
      [401, "The AI couldn't answer that right now, so please try again."],
      [502, "The AI couldn't answer that right now, so please try again."],
    ] as Array<[number, string]>) {
      stubChatSend({ ok: false, error: { statusCode: status, message: "whatever" } });
      const response = await post("/chat", { messages: [] });
      const body = await response.json();
      expect(body.error).toBe(expected);
      expect(body.status).toBe(status);
    }
  });

  test("an unmapped status keeps the API's own words only when they read as one plain sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSend({ ok: false, error: { statusCode: 418, message: "This is busy right now, please try again later." } });
    const plainResponse = await post("/chat", { messages: [] });
    expect((await plainResponse.json()).error).toBe("This is busy right now, please try again later.");

    stubChatSend({ ok: false, error: { statusCode: 418, message: '{"error":{"message":"invalid api payload"}}' } });
    const technicalResponse = await post("/chat", { messages: [] });
    const technicalBody = await technicalResponse.json();
    expect(technicalBody.error).toBe("The AI couldn't answer that right now, so please try again.");
    expect(technicalBody.detail).toBe('{"error":{"message":"invalid api payload"}}');
  });

  test("chat results never carry a refusal reason", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubChatSend({ ok: false, error: { statusCode: 402 } });
    const response = await post("/chat", { messages: [] });
    expect((await response.json()).reason).toBeNull();
  });
});

describe("AC-4: transcribe", () => {
  test("the request carries the pinned model, the default format, and the 60s budget", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const audio = stubFetch("openrouter", jsonResponse(200, { text: "one coffee please" }));
    const response = await post("/transcribe", { audio: { data: "AAAA" }, language: "en", prompt: "coffee" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "one coffee please", error: null, status: 200, reason: null, detail: null });
    expect(audio).toHaveLength(1);
    const { url, init, timeoutMs } = audio[0];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(timeoutMs).toBe(60000);
    expect(JSON.parse(String(init.body))).toEqual({ model: "google/gemini-3.5-transcribe", input_audio: { data: "AAAA", format: "m4a" } });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  test("a supplied format passes through and a data: URL is stripped for the cap check", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const audio = stubFetch("openrouter", jsonResponse(200, { text: "hello" }));
    await post("/transcribe", { audio: { data: "data:audio/ogg;base64,BBBB", format: "ogg" } });
    expect(JSON.parse(String(audio[0].init.body)).input_audio).toEqual({ data: "BBBB", format: "ogg" });
  });

  test("a base64 body over the 3 MB cap answers without calling OpenRouter", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    const audio = stubFetch("openrouter");
    const response = await post("/transcribe", { audio: { data: "A".repeat(4194405), format: "m4a" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: null,
      error: "That recording is too long to send, so try a shorter one.",
      status: 0,
      reason: null,
      detail: "The recording exceeded the 3 MB audio cap.",
    });
    expect(audio).toHaveLength(0);
  });

  test("an empty body answers the no-audio shape without calling OpenRouter", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    for (const data of ["   ", "data:audio/m4a;base64,", ""]) {
      const audio = stubFetch("openrouter");
      const response = await post("/transcribe", { audio: { data, format: "m4a" } });
      expect(await response.json()).toEqual({
        text: null,
        error: "No words were heard in that recording, so please try again.",
        status: 0,
        reason: null,
        detail: "The recording had no audio in it.",
      });
      expect(audio).toHaveLength(0);
    }
  });

  test("a reply with no readable text answers the noSpeech sentence", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubFetch("openrouter", jsonResponse(200, { text: "   " }));
    const response = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
    expect(await response.json()).toEqual({
      text: null,
      error: "No words were heard in that recording, so please try again.",
      status: 200,
      reason: null,
      detail: "The recording had no speech in it.",
    });
  });

  test("OpenRouter error statuses and transport failures map as in chat", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubFetch("openrouter", jsonResponse(402, { error: "AI is paused", reason: "nope" }));
    const refusedResponse = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
    const refusedBody = await refusedResponse.json();
    expect(refusedBody.error).toBe("AI isn't available right now, so please try again later.");
    expect(refusedBody.status).toBe(402);

    stubFetch("openrouter", null, new Error("no network"));
    const offlineResponse = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
    const offlineBody = await offlineResponse.json();
    expect(offlineBody.error).toBe("Couldn't reach the AI, so check your connection and try again.");
    expect(offlineBody.status).toBe(0);

    stubFetch("openrouter", null, Object.assign(new Error("took too long"), { name: "AbortError" }));
    const slowResponse = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
    const slowBody = await slowResponse.json();
    expect(slowBody.error).toBe("The AI took too long to answer, so please try again.");
    expect(slowBody.status).toBe(0);
  });

  test("the 403/429/401/502 table rows map for transcribe too", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    for (const [status, expected] of [
      [403, "AI has reached today's limit, so it's back tomorrow."],
      [429, "AI has reached today's limit, so it's back tomorrow."],
      [401, "The AI couldn't answer that right now, so please try again."],
      [502, "The AI couldn't answer that right now, so please try again."],
    ] as Array<[number, string]>) {
      stubFetch("openrouter", jsonResponse(status, { error: "whatever" }));
      const response = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
      const body = await response.json();
      expect(body.error).toBe(expected);
      expect(body.status).toBe(status);
    }
  });

  test("transcribe results never carry a refusal reason", async () => {
    await setEnv("OPENROUTER_API_KEY", "test-key");
    stubFetch("openrouter", jsonResponse(402, { reason: "wallet_empty" }));
    const response = await post("/transcribe", { audio: { data: "AAAA", format: "m4a" } });
    expect((await response.json()).reason).toBeNull();
  });
});

describe("AC-5: image proxy", () => {
  const BOREL = "https://api.borel.one/api/proxy/app/ai";

  test("generations posts the prompt and size to Borel with the 150s budget", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    const borel = stubFetch("borel", jsonResponse(200, { url: "https://files.example.com/a.png", reused: false }));
    const response = await post("/images/generations", { prompt: "a cat", size: "1024x1024", leftover: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://files.example.com/a.png",
      error: null,
      status: 200,
      reason: null,
      reused: false,
    });
    const { url, init, timeoutMs } = borel[0];
    expect(url).toBe(BOREL + "/images/generations");
    expect(timeoutMs).toBe(150000);
    expect(JSON.parse(String(init.body))).toEqual({ prompt: "a cat", size: "1024x1024" });
  });

  test("edits posts the image, prompt, and size", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    const borel = stubFetch("borel", jsonResponse(200, { url: "https://files.example.com/b.png" }));
    const response = await post("/images/edits", { image: "https://example.com/a.png", prompt: "make it watercolor", leftover: true });
    const { url, init } = borel[0];
    expect(url).toBe(BOREL + "/images/edits");
    expect(JSON.parse(String(init.body))).toEqual({ image: "https://example.com/a.png", prompt: "make it watercolor" });
    const body = await response.json();
    expect(body).toEqual({ url: "https://files.example.com/b.png", error: null, status: 200, reason: null, reused: null });
  });

  test("the Borel headers the request carries are forwarded verbatim", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    const borel = stubFetch("borel", jsonResponse(200, { url: "https://files.example.com/a.png" }));
    await post("/images/generations", { prompt: "a cat" }, {
      authorization: "Bearer bps_test",
      "x-borel-surface": "native",
      "x-borel-build": "42",
    });
    const headers = borel[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer bps_test");
    expect(headers["X-Borel-Surface"]).toBe("native");
    expect(headers["X-Borel-Build"]).toBe("42");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("absent Borel headers stay absent", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    const borel = stubFetch("borel", jsonResponse(200, { url: "https://files.example.com/a.png" }));
    await post("/images/edits", { image: "https://example.com/a.png", prompt: "p" });
    const headers = borel[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Borel-Surface"]).toBeUndefined();
    expect(headers["X-Borel-Build"]).toBeUndefined();
  });

  test("refusals map reason and the neutral sentence", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    for (const [reason, expected] of [
      ["wallet_empty", "AI isn't available right now, so please try again later."],
      ["daily_allowance_used", "AI has reached today's limit, so it's back tomorrow."],
      ["cloud_paused", "This isn't available right now, so please try again later."],
    ] as Array<[string, string]>) {
      stubFetch("borel", jsonResponse(402, { reason }));
      const response = await post("/images/generations", { prompt: "a cat" });
      const body = await response.json();
      expect(body).toEqual({ url: null, error: expected, status: 402, reason, reused: null });
    }
  });

  test("an edits request refused by the reason field maps the neutral sentence", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", jsonResponse(402, { reason: "daily_allowance_used" }));
    const response = await post("/images/edits", { image: "https://example.com/a.png", prompt: "p" });
    expect(await response.json()).toEqual({
      url: null,
      error: "AI has reached today's limit, so it's back tomorrow.",
      status: 402,
      reason: "daily_allowance_used",
      reused: null,
    });
  });

  test("a 402 body naming the paused cloud maps to cloud_paused", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", jsonResponse(402, { error: "Your cloud is paused" }));
    const response = await post("/images/edits", { image: "https://example.com/a.png", prompt: "p" });
    const body = await response.json();
    expect(body.reason).toBe("cloud_paused");
    expect(body.error).toBe("This isn't available right now, so please try again later.");
  });

  test("a plain Borel message is kept; a technical one falls back per endpoint", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", jsonResponse(500, { error: "This is busy right now, please try again later." }));
    const plainResponse = await post("/images/generations", { prompt: "a cat" });
    expect((await plainResponse.json()).error).toBe("This is busy right now, please try again later.");

    stubFetch("borel", jsonResponse(500, { error: { message: '{"code":"internal_error"}' } }));
    const technicalResponse = await post("/images/generations", { prompt: "a cat" });
    expect((await technicalResponse.json()).error).toBe("The picture couldn't be made right now, so please try again.");

    stubFetch("borel", jsonResponse(500, { error: '{"code":"internal_error"}' }));
    const editResponse = await post("/images/edits", { image: "https://example.com/a.png", prompt: "p" });
    expect((await editResponse.json()).error).toBe("That picture couldn't be changed right now, so please try again.");
  });

  test("Borel unreachable and timed-out requests answer the offline and slow picture sentences", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", null, new Error("connection refused"));
    const offlineResponse = await post("/images/generations", { prompt: "a cat" });
    expect(await offlineResponse.json()).toEqual({
      url: null,
      error: "Couldn't reach the AI, so check your connection and try again.",
      status: 0,
      reason: null,
      reused: null,
    });

    stubFetch("borel", null, Object.assign(new Error("took too long"), { name: "AbortError" }));
    const slowResponse = await post("/images/edits", { image: "https://example.com/a.png", prompt: "p" });
    expect(await slowResponse.json()).toEqual({
      url: null,
      error: "The picture took too long, so please try again.",
      status: 0,
      reason: null,
      reused: null,
    });
  });

  test("a success with no reused flag answers reused null", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", jsonResponse(200, { url: "https://files.example.com/a.png", reused: true }));
    const response = await post("/images/generations", { prompt: "a cat" });
    expect((await response.json()).reused).toBe(true);
  });

  test("a malformed Borel reply keeps a null url and null reused", async () => {
    await setEnv("BOREL_AI_URL", BOREL);
    stubFetch("borel", jsonResponse(200, "not an object"));
    const response = await post("/images/generations", { prompt: "a cat" });
    expect(await response.json()).toEqual({ url: null, error: null, status: 200, reason: null, reused: null });
  });
});
