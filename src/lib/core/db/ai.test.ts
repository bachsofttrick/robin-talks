import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import { askAiConsent } from "./consent";
import { ai } from "./ai";

let mockKey = "test-key";

jest.mock("./config", () => ({
  BOREL_AI: "https://borel.test/ai",
  BOREL_USAGE_URL: "https://borel.test/usage",
  IN_BROWSER: false,
  SURFACE: "dev",
  get OPENROUTER_API_KEY() {
    return mockKey;
  },
}));

jest.mock("./notify", () => ({ borelFetch: jest.fn() }));

jest.mock("./consent", () => ({
  askAiConsent: jest.fn(async () => true),
  AI_DECLINED: "This feature needs your permission.",
  AI_AUDIO_MODEL: "qwen/qwen3-asr-0.6b",
}));

jest.mock("@openrouter/sdk/core", () => ({ OpenRouterCore: class {} }));

jest.mock("@openrouter/sdk/funcs/chatSend", () => ({ chatSend: jest.fn() }));

const sendMock = chatSend as unknown as jest.Mock;
const consentMock = askAiConsent as unknown as jest.Mock;

const AI_FAILED = "The AI couldn't answer that right now, so please try again.";
const AI_OFFLINE = "Couldn't reach the AI, so check your connection and try again.";
const AI_SLOW = "The AI took too long to answer, so please try again.";
const AI_TOO_LONG = "That answer was too long, so try asking for less.";
const AI_UNREADABLE = "That answer came back in a form this app couldn't read, so please try again.";
const AI_NO_SPEECH = "No words were heard in that recording, so please try again.";
const NOT_AVAILABLE = "AI isn't available right now, so please try again later.";
const TODAYS_LIMIT = "AI has reached today's limit, so it's back tomorrow.";
const RECORDING_TOO_LONG = "That recording is too long to send, so try a shorter one.";

function choice(content: unknown, finishReason = "stop") {
  return { ok: true, value: { choices: [{ message: { content }, finishReason }] } };
}

function httpError(statusCode: number, name: string, message: string) {
  return { ok: false, error: { statusCode, name, message, body: JSON.stringify({ error: { message, code: statusCode } }) } };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  mockKey = "test-key";
  sendMock.mockReset();
  consentMock.mockReset();
  consentMock.mockResolvedValue(true);
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
});

describe("ai.chat transport", () => {
  test("resolves without a network call when the key is missing", async () => {
    mockKey = "";
    const res = await ai.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(res.error).toBe(AI_FAILED);
    expect(res.detail).toContain("EXPO_PUBLIC_OPENROUTER_API_KEY");
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a successful SDK reply populates text", async () => {
    sendMock.mockResolvedValue(choice("Hi there"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(res.error).toBeNull();
    expect(res.text).toBe("Hi there");
    expect(res.status).toBe(200);
    expect(res.truncated).toBe(false);
  });

  test("a length cutoff sets truncated", async () => {
    sendMock.mockResolvedValue(choice("half a sen", "length"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(res.truncated).toBe(true);
    expect(res.error).toBeNull();
  });

  test("the request carries model and messages to OpenRouter", async () => {
    sendMock.mockResolvedValue(choice("ok"));
    await ai.chat({ messages: [{ role: "system", content: "be kind" }, { role: "user", content: "hello" }], temperature: 0.4 });
    const request = sendMock.mock.calls[0][1];
    expect(request.chatRequest.model).toBe("openai/gpt-6-luna");
    expect(request.chatRequest.temperature).toBe(0.4);
    expect(request.chatRequest.messages).toEqual([
      { role: "system", content: "be kind" },
      { role: "user", content: "hello" },
    ]);
  });
});

describe("ai.chat error mapping", () => {
  test("402 maps to the isn't available sentence", async () => {
    sendMock.mockResolvedValue(httpError(402, "PaymentRequiredResponseError", "Insufficient credits"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(NOT_AVAILABLE);
    expect(res.reason).toBeNull();
    expect(res.detail).toContain("Insufficient credits");
  });

  test("403 maps to the today's limit sentence", async () => {
    sendMock.mockResolvedValue(httpError(403, "ForbiddenResponseError", "Key spend limit reached"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(TODAYS_LIMIT);
  });

  test("429 maps to the today's limit sentence", async () => {
    sendMock.mockResolvedValue(httpError(429, "TooManyRequestsResponseError", "Rate limited"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(TODAYS_LIMIT);
  });

  test("502 maps to the couldn't answer sentence", async () => {
    sendMock.mockResolvedValue(httpError(502, "BadGatewayResponseError", "Bad gateway"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(AI_FAILED);
  });

  test("a connection failure maps to the connection sentence", async () => {
    sendMock.mockResolvedValue({ ok: false, error: { name: "ConnectionError", message: "Network request failed" } });
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(AI_OFFLINE);
  });

  test("an aborted request maps to the timeout sentence", async () => {
    sendMock.mockResolvedValue({ ok: false, error: { name: "RequestAbortedError", message: "aborted" } });
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(AI_SLOW);
  });

  test("a technical API message is replaced with the neutral sentence", async () => {
    sendMock.mockResolvedValue(httpError(400, "BadRequestResponseError", "invalid_request_error: bad model"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(AI_FAILED);
    expect(res.detail).toContain("invalid_request_error");
  });

  test("a plain API message is shown for other codes", async () => {
    sendMock.mockResolvedValue(httpError(400, "BadRequestResponseError", "Your request was too large."));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe("Your request was too large.");
  });
});

describe("ai.chat JSON replies", () => {
  test("json reads an object surrounded by words", async () => {
    sendMock.mockResolvedValue(choice('Here you go: {"action":"reply","text":"hi"}'));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }], jsonSchema: true });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ action: "reply", text: "hi" });
  });

  test("two unreadable replies resolve as the unreadable sentence", async () => {
    sendMock.mockResolvedValue(choice("not json at all"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }], jsonSchema: true });
    expect(res.error).toBe(AI_UNREADABLE);
    expect(res.data).toBeNull();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test("a truncated JSON reply reports the too long sentence", async () => {
    sendMock.mockResolvedValue(choice('{"action":"rep', "length"));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }], jsonSchema: true });
    expect(res.error).toBe(AI_TOO_LONG);
    expect(res.data).toBeNull();
  });

  test("a schema is forwarded as an OpenRouter structured-output response format", async () => {
    sendMock.mockResolvedValue(choice('{"text":"hi","complete":false,"remember":null}'));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }], jsonSchema: { name: "robin_turn", schema: { type: "object" } } });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ text: "hi", complete: false, remember: null });
    const request = sendMock.mock.calls[0][1].chatRequest;
    expect(request.responseFormat).toEqual({
      type: "json_schema",
      jsonSchema: { name: "robin_turn", strict: true, schema: { type: "object" } },
    });
    expect(request.provider).toEqual({ requireParameters: true });
  });
});

describe("ai.chat photo preprocessing", () => {
  test("a device photo is encoded before the request", async () => {
    (globalThis as any).FileReader = undefined;
    fetchMock.mockResolvedValue({ blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) });
    sendMock.mockResolvedValue(choice("nice photo"));
    await ai.chat({
      messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "file://photo.jpg" } }] }],
    });
    const part = sendMock.mock.calls[0][1].chatRequest.messages[0].content[1];
    expect(part.imageUrl.url).toBe("data:image/jpeg;base64,AQID");
  });
});

describe("ai.transcribe transport", () => {
  test("sends exactly the model and input_audio, and reads text back", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "hello world" }) });
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res.error).toBeNull();
    expect(res.text).toBe("hello world");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(JSON.parse(init.body)).toEqual({
      model: "qwen/qwen3-asr-0.6b",
      input_audio: { data: "AAAA", format: "m4a" },
    });
  });

  test("strips a data: URL down to raw base64", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "hi" }) });
    await ai.transcribe({ audio: { base64: "data:audio/m4a;base64,AAAA", mimeType: "audio/m4a" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_audio.data).toBe("AAAA");
  });

  test("empty text reports the no words sentence", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res.error).toBe(AI_NO_SPEECH);
  });

  test("an oversized recording is refused before any request", async () => {
    const res = await ai.transcribe({ audio: { uri: "file://big.m4a", fileSize: 4000000 } });
    expect(res.error).toBe(RECORDING_TOO_LONG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a 502 reports the couldn't answer sentence", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: { message: "Bad gateway" } }) });
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res.error).toBe(AI_FAILED);
  });

  test("missing key resolves without any request", async () => {
    mockKey = "";
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res.error).toBe(AI_FAILED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
