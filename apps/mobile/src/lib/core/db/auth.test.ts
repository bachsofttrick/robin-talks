import { createClient } from "@neondatabase/neon-js";
import { brokerAuth as mockedBrokerAuth } from "./browser-auth";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock("@neondatabase/neon-js", () => ({
  createClient: jest.fn(() => ({ auth: {}, dataApi: {} })),
  SupabaseAuthAdapter: jest.fn(() => ({})),
}));

jest.mock("./browser-auth", () => ({
  brokerAuth: { onAuthStateChange: () => {}, getBetterAuthInstance: () => ({}) },
  createBrowserAuth: jest.fn(),
}));

const createClientMock = createClient as unknown as jest.Mock;

type AuthModule = typeof import("./auth");

const ENV = { EXPO_PUBLIC_BACKEND_AUTH_URL: "http://localhost:3000/api/auth" };
const originalEnv = { ...process.env };

describe("db/auth (browser)", () => {
  let mod: AuthModule;
  let fetchMock: jest.Mock;
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_BACKEND_AUTH_URL = ENV.EXPO_PUBLIC_BACKEND_AUTH_URL;
    (globalThis as any).document = {};
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    (globalThis as any).fetch = fetchMock;

    jest.isolateModules(() => {
      mod = jest.requireActual("./auth") as AuthModule;
    });
  });

  afterAll(() => {
    delete (globalThis as any).document;
    (globalThis as any).fetch = originalFetch;
    if (originalEnv.EXPO_PUBLIC_BACKEND_AUTH_URL === undefined) delete process.env.EXPO_PUBLIC_BACKEND_AUTH_URL;
    else process.env.EXPO_PUBLIC_BACKEND_AUTH_URL = originalEnv.EXPO_PUBLIC_BACKEND_AUTH_URL;
  });

  beforeEach(() => {
    fetchMock.mockClear();
  });

  test("authCall POSTs to BACKEND_AUTH_URL with credentials include and no Cookie header", async () => {
    await mod.authCall("/reset", { email: "a@b.c" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/auth/reset");
    expect(url).toBe(ENV.EXPO_PUBLIC_BACKEND_AUTH_URL + "/reset");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");

    const headerNames = Object.keys(init.headers).map((name) => name.toLowerCase());
    expect(headerNames).not.toContain("cookie");
    expect(init.headers.Cookie).toBeUndefined();
    expect(init.headers.cookie).toBeUndefined();
  });

  test("the browser data client uses the bps_anon token provider and authHeader returns bps_anon", async () => {
    const browserOptions = createClientMock.mock.calls.map((call) => call[0]).find((options) => options?.dataApi?.getToken);
    expect(browserOptions).toBeDefined();
    await expect(browserOptions.dataApi.getToken()).resolves.toBe("bps_anon");
    await expect(mod.authHeader()).resolves.toBe("bps_anon");
  });

  test("brokerAuth is the browser wrapper with onAuthStateChange and getBetterAuthInstance", () => {
    expect(mod.brokerAuth).toBe(mockedBrokerAuth);
    expect(typeof mod.brokerAuth.onAuthStateChange).toBe("function");
    expect(typeof mod.brokerAuth.getBetterAuthInstance).toBe("function");
  });
});
