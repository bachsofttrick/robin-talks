/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";
import { ai } from "./ai";
import { askAiConsent } from "./consent";
import { sessionCookieHeader, authHeader } from "./auth";
import { noteRefusal, postToParent } from "./errors";

let mockBackendAiUrl = "http://localhost:3000/api/ai";
let mockInBrowser = false;
let mockBuildStamp = "dev-build-1";
let mockCookie = "better-auth.session_token=abc.def";
let mockBearer = "tok-123";

jest.mock("./config", () => ({
  get BACKEND_AI_URL() {
    return mockBackendAiUrl;
  },
  get IN_BROWSER() {
    return mockInBrowser;
  },
  borelHeaders: () => ({
    "X-Borel-Surface": "dev",
    ...(mockBuildStamp ? { "X-Borel-Build": mockBuildStamp } : {}),
  }),
}));

jest.mock("./auth", () => ({
  sessionCookieHeader: jest.fn(async () => mockCookie),
  authHeader: jest.fn(async () => mockBearer),
}));

jest.mock("./consent", () => ({
  askAiConsent: jest.fn(async () => true),
  AI_DECLINED: "This feature shares what you send with AI, so it needs your permission. Use it again and tap Allow to turn it on.",
  AI_AUDIO_MODEL: "google/gemini-3.5-transcribe",
}));

jest.mock("./errors", () => ({
  messageOf: (json: any) => (json && typeof json === "object" && typeof json.error === "string" ? json.error : null),
  noteRefusal: jest.fn(),
  postToParent: jest.fn(),
}));

const BACKEND = "http://localhost:3000/api/ai";
const COOKIE = "better-auth.session_token=abc.def";
const DECLINED = "This feature shares what you send with AI, so it needs your permission. Use it again and tap Allow to turn it on.";
const OFFLINE = "Couldn't reach the AI, so check your connection and try again.";
const SLOW = "The AI took too long to answer, so please try again.";
const PICTURE_SLOW = "The picture took too long, so please try again.";
const BACK = "Sign in to use this feature.";
const NO_BACKEND = "The backend is not configured.";
const NOT_AVAILABLE = "AI isn't available right now, so please try again later.";
const NO_SPEECH = "No words were heard in that recording, so please try again.";
const RECORDING_TOO_LONG = "That recording is too long to send, so try a shorter one.";
const NO_PHOTO = "No photo was chosen.";

const consentMock = askAiConsent as unknown as jest.Mock;
const cookieMock = sessionCookieHeader as unknown as jest.Mock;
const authHeaderMock = authHeader as unknown as jest.Mock;
const noteRefusalMock = noteRefusal as unknown as jest.Mock;
const postToParentMock = postToParent as unknown as jest.Mock;

const originalFetch = globalThis.fetch;
const originalFileReader = (globalThis as any).FileReader;

let fetchMock: jest.Mock;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

beforeAll(() => {
  (globalThis as any).FileReader = undefined;
});

beforeEach(() => {
  mockBackendAiUrl = "http://localhost:3000/api/ai";
  mockInBrowser = false;
  mockBuildStamp = "dev-build-1";
  mockCookie = COOKIE;
  mockBearer = "tok-123";
  consentMock.mockReset();
  consentMock.mockResolvedValue(true);
  cookieMock.mockReset();
  cookieMock.mockImplementation(async () => mockCookie);
  authHeaderMock.mockReset();
  authHeaderMock.mockImplementation(async () => mockBearer);
  noteRefusalMock.mockClear();
  postToParentMock.mockClear();
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
});

afterAll(() => {
  (globalThis as any).fetch = originalFetch;
  (globalThis as any).FileReader = originalFileReader;
});

describe("the public surface", () => {
  test("ai.models pins both ids to the same backend-allowlisted model", () => {
    expect(ai.models).toEqual({ fast: "openai/gpt-6-luna", smart: "openai/gpt-6-luna" });
  });
});

describe("ai.chat thin client", () => {
  test("posts the wire body to /api/ai/chat and passes the result through field for field", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ text: "ok", data: { a: 1 }, error: null, status: 200, reason: null, truncated: true, raw: { choices: [] }, detail: null }),
    );
    const res = await ai.chat({
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
      max_tokens: 50,
      jsonSchema: { name: "robin_turn", schema: { type: "object" } },
    });
    expect(res).toEqual({ text: "ok", data: { a: 1 }, error: null, status: 200, reason: null, truncated: true, raw: { choices: [] }, detail: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BACKEND + "/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      model: "openai/gpt-6-luna",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
      max_tokens: 50,
      jsonSchema: { name: "robin_turn", schema: { type: "object" } },
    });
    expect(noteRefusalMock).not.toHaveBeenCalled();
  });

  test("native replays the session cookie with credentials omitted and no Borel headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "hi" }));
    await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    const init = fetchMock.mock.calls[0][1];
    expect(cookieMock).toHaveBeenCalledTimes(1);
    expect(init.headers.Cookie).toBe(COOKIE);
    expect(init.credentials).toBe("omit");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-Borel-Surface"]).toBeUndefined();
    expect(init.headers["X-Borel-Build"]).toBeUndefined();
    expect(authHeaderMock).not.toHaveBeenCalled();
  });

  test("an empty session cookie leaves the Cookie header out", async () => {
    mockCookie = "";
    fetchMock.mockResolvedValue(jsonResponse({ text: "hi" }));
    await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(fetchMock.mock.calls[0][1].headers.Cookie).toBeUndefined();
  });

  test("a device photo is normalized into a data: URL in the wire body", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("file://")
        ? Promise.resolve({ blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) })
        : Promise.resolve(jsonResponse({ text: "nice photo", data: null, error: null, status: 200, reason: null, truncated: false, raw: null, detail: null })),
    );
    const res = await ai.chat({
      messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "file://photo.jpg" } }] }],
    });
    expect(res.error).toBeNull();
    const wire = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(wire.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } });
  });

  test("an input_audio part passes through untouched", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "heard you", data: null, error: null, status: 200, reason: null, truncated: false, raw: null, detail: null }));
    await ai.chat({
      messages: [{ role: "user", content: [{ type: "text", text: "listen" }, { type: "input_audio", input_audio: { data: "AQID", format: "m4a" } }] }],
    });
    const wire = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(wire.messages[0].content[1]).toEqual({ type: "input_audio", input_audio: { data: "AQID", format: "m4a" } });
  });

  test("a missing photo resolves no photo was chosen without a request", async () => {
    const res = await ai.chat({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: null as unknown as string } }] }] });
    expect(res.error).toBe(NO_PHOTO);
    expect(res.status).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a photo that cannot be read resolves the unreadable sentence without a backend request", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("file://")
        ? Promise.resolve({ blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => { throw new Error("corrupt"); } }) })
        : Promise.resolve(jsonResponse({ text: "x" })),
    );
    const res = await ai.chat({
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "file://broken.jpg" } }] }],
    });
    expect(res.error).toBe("That photo couldn't be read, so try picking it again.");
    expect(res.status).toBe(0);
    expect(res.detail).toBe("corrupt");
    const backendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/ai"));
    expect(backendCalls).toHaveLength(0);
  });
});

describe("ai.transcribe thin client", () => {
  test("the wire body carries only the audio", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "hello world", error: null, status: 200, reason: null, detail: null }));
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" }, language: "en", prompt: "names" });
    expect(res).toEqual({ text: "hello world", error: null, status: 200, reason: null, detail: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BACKEND + "/transcribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ audio: { data: "AAAA", format: "m4a" } });
  });

  test("a data: URL audio is sent as it stands and the backend strips the prefix", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "hi", error: null, status: 200, reason: null, detail: null }));
    await ai.transcribe({ audio: { base64: "data:audio/m4a;base64,AAAA", mimeType: "audio/m4a" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).audio).toEqual({ data: "data:audio/m4a;base64,AAAA", format: "m4a" });
  });

  test("an empty base64 recording reports no words without any request", async () => {
    const res = await ai.transcribe({ audio: { base64: "", mimeType: "audio/m4a" } });
    expect(res.error).toBe(NO_SPEECH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an oversized recording is refused before any request", async () => {
    const res = await ai.transcribe({ audio: { uri: "file://big.m4a", fileSize: 4000000 } });
    expect(res.error).toBe(RECORDING_TOO_LONG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a missing recording reports that none was made", async () => {
    const res = await ai.transcribe({ audio: null });
    expect(res.error).toBe("No recording was made.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a uri-only recording that reads back empty reports no words without a request", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("file://") ? Promise.resolve({ blob: async () => new Blob([]) }) : Promise.resolve(jsonResponse({ text: "x" })),
    );
    const res = await ai.transcribe({ audio: { uri: "file://empty.m4a", fileSize: 0 } });
    expect(res.error).toBe(NO_SPEECH);
    const backendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/ai"));
    expect(backendCalls).toHaveLength(0);
  });
});

describe("image endpoints thin client", () => {
  test("a generation posts to /images/generations with Content-Type and the Borel headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/a.png", error: null, status: 200, reason: null, reused: true }));
    const res = await ai.image({ prompt: "unique-gen", size: "1024x1024" });
    expect(res).toEqual({ url: "https://img.test/a.png", error: null, status: 200, reason: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BACKEND + "/images/generations");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Borel-Surface"]).toBe("dev");
    expect(init.headers["X-Borel-Build"]).toBe("dev-build-1");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
    expect(JSON.parse(init.body)).toEqual({ prompt: "unique-gen", size: "1024x1024" });
  });

  test("the Borel build stamp and bearer are omitted entirely when empty", async () => {
    mockBuildStamp = "";
    mockBearer = "";
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/b.png", error: null, status: 200, reason: null, reused: true }));
    await ai.image({ prompt: "unique-headers" });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["X-Borel-Build"]).toBeUndefined();
    expect(init.headers.Authorization).toBeUndefined();
  });

  test("an edit posts to /images/edits with the normalized image", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/c.png", error: null, status: 200, reason: null, reused: true }));
    const res = await ai.editImage({ image: "https://x.test/a.png", prompt: "make it a watercolor" });
    expect(res).toEqual({ url: "https://img.test/c.png", error: null, status: 200, reason: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BACKEND + "/images/edits");
    expect(JSON.parse(init.body)).toEqual({ image: "https://x.test/a.png", prompt: "make it a watercolor" });
  });

  test("a refusal result records the refusal and resolves the backend's sentence", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: null, error: NOT_AVAILABLE, status: 402, reason: "wallet_empty", reused: null }));
    const res = await ai.image({ prompt: "unique-refusal" });
    expect(noteRefusalMock).toHaveBeenCalledWith("wallet_empty");
    expect(res).toEqual({ url: null, error: NOT_AVAILABLE, status: 402, reason: "wallet_empty" });
    expect(postToParentMock).not.toHaveBeenCalled();
  });

  test("an edit refusal records the refusal and resolves the backend's sentence", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: null, error: NOT_AVAILABLE, status: 402, reason: "wallet_empty", reused: null }));
    const res = await ai.editImage({ image: "https://x.test/a.png", prompt: "unique-edit-refusal" });
    expect(noteRefusalMock).toHaveBeenCalledWith("wallet_empty");
    expect(res).toEqual({ url: null, error: NOT_AVAILABLE, status: 402, reason: "wallet_empty" });
    expect(postToParentMock).not.toHaveBeenCalled();
  });

  test("image generation shares one request for the same prompt and size", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    fetchMock.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const first = ai.image({ prompt: "unique-dedupe", size: "1024x1024" });
    const second = ai.image({ prompt: "unique-dedupe", size: "1024x1024" });
    expect(second).toBe(first);
    while (fetchMock.mock.calls.length === 0) await Promise.resolve();
    for (const resolve of resolvers) resolve(jsonResponse({ url: "https://img.test/d.png", error: null, status: 200, reason: null, reused: true }));
    const [a, b] = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  test("editImage never dedupes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/e.png", error: null, status: 200, reason: null, reused: true }));
    await Promise.all([ai.editImage({ image: "https://x.test/a.png", prompt: "go" }), ai.editImage({ image: "https://x.test/a.png", prompt: "go" })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("the same prompt with a different size is a different key and fires again", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/size.png", error: null, status: 200, reason: null, reused: true }));
    await ai.image({ prompt: "unique-size-key", size: "1024x1024" });
    await ai.image({ prompt: "unique-size-key", size: "1536x1024" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a failed generation is dropped so a retry fires again", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ url: null, error: PICTURE_SLOW, status: 0, reason: null, reused: null }))
      .mockResolvedValueOnce(jsonResponse({ url: "https://img.test/f.png", error: null, status: 200, reason: null, reused: true }));
    const first = await ai.image({ prompt: "unique-retry" });
    expect(first.error).toBe(PICTURE_SLOW);
    const second = await ai.image({ prompt: "unique-retry" });
    expect(second.url).toBe("https://img.test/f.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("an unreadable photo on edit resolves no photo was chosen without a request", async () => {
    const res = await ai.editImage({ image: null, prompt: "go" });
    expect(res).toEqual({ url: null, error: NO_PHOTO, status: 0, reason: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the consent gate", () => {
  test("chat asks by what the messages carry", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "ok" }));
    await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(consentMock).toHaveBeenLastCalledWith("chat", "openai/gpt-6-luna");
    await ai.chat({ messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "https://x.test/a.png" } }] }] });
    expect(consentMock).toHaveBeenLastCalledWith("photoChat", "openai/gpt-6-luna");
    await ai.chat({ messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: "AQ" } }] }] });
    expect(consentMock).toHaveBeenLastCalledWith("audio", "openai/gpt-6-luna");
    await ai.chat({
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://x.test/a.png" } },
            { type: "input_audio", input_audio: { data: "AQ" } },
          ],
        },
      ],
    });
    expect(consentMock).toHaveBeenLastCalledWith("audio", "openai/gpt-6-luna");
  });

  test("the other surfaces ask their own kind", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "hi" }));
    await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(consentMock).toHaveBeenLastCalledWith("audio", "google/gemini-3.5-transcribe");
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/g.png", error: null, status: 200, reason: null, reused: true }));
    await ai.image({ prompt: "unique-consent" });
    expect(consentMock).toHaveBeenLastCalledWith("image", "");
    await ai.editImage({ image: "https://x.test/a.png", prompt: "go" });
    expect(consentMock).toHaveBeenLastCalledWith("editImage", "");
  });

  test("a chat decline resolves the exact sentence and issues no request", async () => {
    consentMock.mockResolvedValue(false);
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res).toEqual({ text: null, data: null, error: DECLINED, status: 0, reason: null, truncated: false, raw: null, detail: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a transcribe decline resolves the exact sentence and issues no request", async () => {
    consentMock.mockResolvedValue(false);
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res).toEqual({ text: null, error: DECLINED, status: 0, reason: null, detail: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an image decline resolves the exact sentence and issues no request", async () => {
    consentMock.mockResolvedValue(false);
    const res = await ai.image({ prompt: "unique-decline" });
    expect(res).toEqual({ url: null, error: DECLINED, status: 0, reason: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an edit decline resolves the exact sentence and issues no request", async () => {
    consentMock.mockResolvedValue(false);
    const res = await ai.editImage({ image: "https://x.test/a.png", prompt: "go" });
    expect(res).toEqual({ url: null, error: DECLINED, status: 0, reason: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("transport fallbacks", () => {
  test.each([
    ["chat", () => ai.chat({ messages: [{ role: "user", content: "hi" }] })],
    ["transcribe", () => ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } })],
    ["image", () => ai.image({ prompt: "unique-offline" })],
    ["editImage", () => ai.editImage({ image: "https://x.test/a.png", prompt: "go" })],
  ])("a network failure on %s resolves the offline sentence", async (_name, call) => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    const res = await call();
    expect(res.error).toBe(OFFLINE);
    expect(res.status).toBe(0);
  });

  test("a non-401 failure status resolves the offline sentence with the status kept", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, false, 503));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.error).toBe(OFFLINE);
    expect(res.status).toBe(503);
    expect(res.detail).toBeNull();
  });

  test("a 401 with a readable error resolves that sentence", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Sign in first plz." }, false, 401));
    const res = await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res).toEqual({ text: null, data: null, error: "Sign in first plz.", status: 401, reason: null, truncated: false, raw: null, detail: null });
  });

  test("a 401 on an edit resolves the body's sentence with the status kept", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Sign in first plz." }, false, 401));
    const res = await ai.editImage({ image: "https://x.test/a.png", prompt: "unique-edit-401" });
    expect(res).toEqual({ url: null, error: "Sign in first plz.", status: 401, reason: null });
    expect(postToParentMock).not.toHaveBeenCalled();
    expect(noteRefusalMock).not.toHaveBeenCalled();
  });

  test("a refusal-shaped body on transcribe never turns into a recorded refusal", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: null, error: NOT_AVAILABLE, status: 402, reason: "wallet_empty", detail: null }));
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res).toEqual({ text: null, error: NOT_AVAILABLE, status: 402, reason: null, detail: null });
    expect(noteRefusalMock).not.toHaveBeenCalled();
  });

  test("a 401 with an unreadable body resolves the sign-in sentence", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("no json");
      },
    });
    const res = await ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    expect(res).toEqual({ text: null, error: BACK, status: 401, reason: null, detail: null });
  });

  test("a 401 on an image resolves the sign-in sentence without metering", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("no json");
      },
    });
    const res = await ai.image({ prompt: "unique-401" });
    expect(res).toEqual({ url: null, error: BACK, status: 401, reason: null });
    expect(postToParentMock).not.toHaveBeenCalled();
    expect(noteRefusalMock).not.toHaveBeenCalled();
  });

  test.each([
    ["chat", () => ai.chat({ messages: [{ role: "user", content: "hi" }] }), { text: null, data: null, error: NO_BACKEND, status: 0, reason: null, truncated: false, raw: null, detail: null }],
    ["transcribe", () => ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } }), { text: null, error: NO_BACKEND, status: 0, reason: null, detail: null }],
    ["image", () => ai.image({ prompt: "unique-unset" }), { url: null, error: NO_BACKEND, status: 0, reason: null }],
    ["editImage", () => ai.editImage({ image: "https://x.test/a.png", prompt: "go" }), { url: null, error: NO_BACKEND, status: 0, reason: null }],
  ])("an unset backend url on %s resolves the not-configured sentence without a request", async (_name, call, shape) => {
    mockBackendAiUrl = "";
    const res = await call();
    expect(res).toEqual(shape);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("client timeouts", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("a hanging chat request resolves the slow sentence after 65s", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = ai.chat({ messages: [{ role: "user", content: "hi" }] });
    await jest.advanceTimersByTimeAsync(65000);
    const res = await pending;
    expect(res).toEqual({ text: null, data: null, error: SLOW, status: 0, reason: null, truncated: false, raw: null, detail: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a hanging transcribe request resolves the slow sentence after 65s", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = ai.transcribe({ audio: { base64: "AAAA", mimeType: "audio/m4a" } });
    await jest.advanceTimersByTimeAsync(65000);
    const res = await pending;
    expect(res).toEqual({ text: null, error: SLOW, status: 0, reason: null, detail: null });
  });

  test("a hanging image request resolves the slow picture sentence after 160s", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = ai.image({ prompt: "unique-timeout" });
    await jest.advanceTimersByTimeAsync(160000);
    const res = await pending;
    expect(res).toEqual({ url: null, error: PICTURE_SLOW, status: 0, reason: null });
  });

  test("a hanging edit request resolves the slow picture sentence after 160s, not the chat slow sentence", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = ai.editImage({ image: "https://x.test/a.png", prompt: "unique-edit-timeout" });
    await jest.advanceTimersByTimeAsync(160000);
    const res = await pending;
    expect(res).toEqual({ url: null, error: PICTURE_SLOW, status: 0, reason: null });
    expect(res.error).not.toBe(SLOW);
  });
});

describe("on a phone", () => {
  test("a fresh picture never posts ai:metered and a success notes no refusal", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/k.png", error: null, status: 200, reason: null, reused: false }));
    const res = await ai.image({ prompt: "native-fresh" });
    expect(res).toEqual({ url: "https://img.test/k.png", error: null, status: 200, reason: null });
    expect("reused" in res).toBe(false);
    expect(postToParentMock).not.toHaveBeenCalled();
    expect(noteRefusalMock).not.toHaveBeenCalled();
  });
});

describe("in the browser", () => {
  beforeEach(() => {
    mockInBrowser = true;
  });

  test("sends credentials include and never a Cookie header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: "hi" }));
    await ai.chat({ messages: [{ role: "user", content: "hi" }] });
    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe("include");
    expect(init.headers.Cookie).toBeUndefined();
    expect(cookieMock).not.toHaveBeenCalled();
  });

  test("a fresh picture posts ai:metered to the parent", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/h.png", error: null, status: 200, reason: null, reused: false }));
    const res = await ai.image({ prompt: "browser-fresh" });
    expect(postToParentMock).toHaveBeenCalledWith({ type: "ai:metered" });
    expect(res).toEqual({ url: "https://img.test/h.png", error: null, status: 200, reason: null });
  });

  test("a missing reused flag counts as a fresh picture", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/i.png", error: null, status: 200, reason: null }));
    await ai.image({ prompt: "browser-flagless" });
    expect(postToParentMock).toHaveBeenCalledWith({ type: "ai:metered" });
  });

  test("a reused picture does not post ai:metered", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/j.png", error: null, status: 200, reason: null, reused: true }));
    const res = await ai.image({ prompt: "browser-reused" });
    expect(postToParentMock).not.toHaveBeenCalled();
    expect(res).toEqual({ url: "https://img.test/j.png", error: null, status: 200, reason: null });
  });

  test("a fresh edit also posts ai:metered and strips reused", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://img.test/l.png", error: null, status: 200, reason: null, reused: false }));
    const res = await ai.editImage({ image: "https://x.test/a.png", prompt: "browser-edit-fresh" });
    expect(postToParentMock).toHaveBeenCalledWith({ type: "ai:metered" });
    expect(res).toEqual({ url: "https://img.test/l.png", error: null, status: 200, reason: null });
    expect("reused" in res).toBe(false);
  });
});

describe("AC-11 source scan", () => {
  test("the provider domain appears in no source file except consent.ts", () => {
    const needle = "openrouter" + ".ai";
    const srcDir = path.resolve(__dirname, "..", "..", "..");
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) visit(path.join(dir, entry.name));
        else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(path.join(dir, entry.name));
      }
    };
    visit(srcDir);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .filter((file) => path.basename(file) !== "consent.ts")
      .filter((file) => fs.readFileSync(file, "utf8").includes(needle))
      .map((file) => path.relative(srcDir, file));
    expect(offenders).toEqual([]);
  });
});
