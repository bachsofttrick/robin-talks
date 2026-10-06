import { sessionCookieHeader } from "./auth";
import { backendDataUrl } from "./config";
import {
  addMemory,
  createSession,
  deleteAllMemory,
  deleteAllSessions,
  getOpenSession,
  getProfile,
  getRecentSessions,
  getSession,
  listMemory,
  saveProfile,
  updateSession,
  upsertProfile,
} from "./data";

jest.mock("./auth", () => ({
  sessionCookieHeader: jest.fn(async () => "better-auth.session_token=abc.def"),
}));

let mockInBrowser = false;

jest.mock("./config", () => ({
  backendDataUrl: jest.fn(() => "http://localhost:3000/api/data"),
  get IN_BROWSER() {
    return mockInBrowser;
  },
}));

const cookieMock = sessionCookieHeader as unknown as jest.Mock;
const dataUrlMock = backendDataUrl as unknown as jest.Mock;

const BASE = "http://localhost:3000/api/data";
const COOKIE = "better-auth.session_token=abc.def";

const originalFetch = globalThis.fetch;

let fetchMock: jest.Mock;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  mockInBrowser = false;
  cookieMock.mockReset();
  cookieMock.mockResolvedValue(COOKIE);
  dataUrlMock.mockReset();
  dataUrlMock.mockReturnValue(BASE);
  fetchMock = jest.fn().mockResolvedValue(jsonResponse({}));
  (globalThis as any).fetch = fetchMock;
});

afterAll(() => {
  (globalThis as any).fetch = originalFetch;
});

const CASES: [string, () => Promise<unknown>, string, string][] = [
  ["getProfile", () => getProfile(), "GET", "/profile"],
  ["saveProfile", () => saveProfile("Ana", "A2"), "PUT", "/profile"],
  ["createSession", () => createSession("cafe"), "POST", "/sessions"],
  ["getOpenSession", () => getOpenSession(), "GET", "/sessions/open"],
  ["getRecentSessions", () => getRecentSessions(), "GET", "/sessions/recent"],
  ["getSession", () => getSession("x"), "GET", "/sessions/x"],
  ["updateSession", () => updateSession("x", { summary: "done" }), "PATCH", "/sessions/x"],
  ["deleteAllSessions", () => deleteAllSessions(), "DELETE", "/sessions"],
  ["listMemory", () => listMemory(), "GET", "/memory"],
  ["addMemory", () => addMemory("fact", "likes tea"), "POST", "/memory"],
  ["deleteAllMemory", () => deleteAllMemory(), "DELETE", "/memory"],
  ["upsertProfile", () => upsertProfile({ email: null, display_name: "Ana", avatar_url: null }), "PUT", "/profiles"],
];

describe("data client requests", () => {
  test.each(CASES)("%s issues %s %s", async (_name, call, method, path) => {
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BASE + path);
    expect(init.method ?? "GET").toBe(method);
  });

  test.each(CASES)("%s carries the session cookie", async (_name, call) => {
    await call();
    const init = fetchMock.mock.calls[0][1];
    expect(cookieMock).toHaveBeenCalled();
    expect(init.headers.Cookie).toBe(COOKIE);
  });

  test("in the browser sends credentials include and no Cookie header", async () => {
    mockInBrowser = true;
    await getProfile();
    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe("include");
    expect(init.headers.Cookie).toBeUndefined();
    expect(cookieMock).not.toHaveBeenCalled();
  });

  test("a 200 JSON body resolves data with no error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user_id: "u1", display_name: "Ana", level: "A2" }));
    const res = await getProfile();
    expect(res).toEqual({ data: { user_id: "u1", display_name: "Ana", level: "A2" }, error: null });
  });

  test("a non-ok response resolves the server's error field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "That profile is missing." }, false, 404));
    const res = await getProfile();
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ message: "That profile is missing." });
  });

  test("a non-ok response resolves the server's message field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Please try again." }, false, 500));
    const res = await saveProfile("Ana", "A2");
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ message: "Please try again." });
  });

  test("an unconfigured backend resolves an error without fetching", async () => {
    dataUrlMock.mockReturnValue("");
    const res = await getProfile();
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ message: "The backend is not configured." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookieMock).not.toHaveBeenCalled();
  });
});

describe("backendDataUrl", () => {
  const originalAuthUrl = process.env.EXPO_PUBLIC_BACKEND_AUTH_URL;

  function realBackendDataUrl(value: string): string {
    process.env.EXPO_PUBLIC_BACKEND_AUTH_URL = value;
    let url = "";
    jest.isolateModules(() => {
      url = (jest.requireActual("./config") as typeof import("./config")).backendDataUrl();
    });
    return url;
  }

  test.each([
    ["http://localhost:3000/api/auth", "http://localhost:3000/api/data"],
    ["http://localhost:3000/api/auth/", "http://localhost:3000/api/data"],
    ["", ""],
    ["http://localhost:3000/api/other", ""],
  ])("maps %p to %p", (input, expected) => {
    expect(realBackendDataUrl(input)).toBe(expected);
  });

  afterAll(() => {
    if (originalAuthUrl === undefined) delete process.env.EXPO_PUBLIC_BACKEND_AUTH_URL;
    else process.env.EXPO_PUBLIC_BACKEND_AUTH_URL = originalAuthUrl;
  });
});
