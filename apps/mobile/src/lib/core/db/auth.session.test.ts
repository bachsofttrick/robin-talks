const mockGetItem = jest.fn(async () => null as string | null);
const mockSetItem = jest.fn(async (_key: string, _value: string) => {});
const mockRemoveItem = jest.fn(async (_key: string) => {});

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
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

type AuthModule = typeof import("./auth");

const ENV = { EXPO_PUBLIC_BACKEND_URL: "http://localhost:3000/api" };
const originalEnv = { ...process.env };

const AUTH_URL = ENV.EXPO_PUBLIC_BACKEND_URL + "/auth";
const SESSION_STORAGE_KEY = "backend-auth-session:" + AUTH_URL;

const SIGN_IN_URL = AUTH_URL + "/sign-in/email";
const SIGN_OUT_URL = AUTH_URL + "/sign-out";

// Android's native layer joins duplicate Set-Cookie lines with ", ", so the
// JS-visible Rn Headers has no getSetCookie and get("set-cookie") returns this.
const SIGN_IN_SET_COOKIE =
  "better-auth.session_token=tok.sig; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax, " +
  "better-auth.session_data=abc; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax";
const SIGN_OUT_SET_COOKIE = "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

type RnHeaders = {
  get(name: string): string | null;
  has(name: string): boolean;
};

function rnHeaders(map: Record<string, string>): RnHeaders {
  const lower: Record<string, string> = {};
  for (const key of Object.keys(map)) lower[key.toLowerCase()] = map[key];
  return {
    get(name: string) {
      return lower[name.toLowerCase()] ?? null;
    },
    has(name: string) {
      return Object.prototype.hasOwnProperty.call(lower, name.toLowerCase());
    },
    // Intentionally no getSetCookie: this is the React Native response shape.
  };
}

function signInResponse(): { ok: boolean; headers: RnHeaders } {
  return { ok: true, headers: rnHeaders({ "set-cookie": SIGN_IN_SET_COOKIE }) };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(rounds = 25): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

describe("db/auth session cookie jar (native)", () => {
  let mod: AuthModule;
  let storedValue: string | null;
  let callOrder: string[];
  let warnSpy: jest.SpyInstance;

  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_BACKEND_URL = ENV.EXPO_PUBLIC_BACKEND_URL;
    // No globalThis.document: IN_BROWSER is false, the native branch runs.
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  });

  afterAll(() => {
    (globalThis as any).fetch = originalFetch;
    if (originalEnv.EXPO_PUBLIC_BACKEND_URL === undefined) delete process.env.EXPO_PUBLIC_BACKEND_URL;
    else process.env.EXPO_PUBLIC_BACKEND_URL = originalEnv.EXPO_PUBLIC_BACKEND_URL;
  });

  // A fresh module registry resets the module-scope jar and load memo.
  function freshAuth(): AuthModule {
    let fresh!: AuthModule;
    jest.isolateModules(() => {
      fresh = jest.requireActual("./auth") as AuthModule;
    });
    return fresh;
  }

  beforeEach(() => {
    storedValue = null;
    callOrder = [];
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockRemoveItem.mockReset();
    mockGetItem.mockImplementation(async () => {
      callOrder.push("getItem");
      return storedValue;
    });
    mockSetItem.mockImplementation(async (_key: string, value: string) => {
      callOrder.push("setItem");
      storedValue = value;
    });
    mockRemoveItem.mockImplementation(async () => {
      callOrder.push("removeItem");
      storedValue = null;
    });
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("sign-in capture: onResponse writes both Better Auth cookies under the session key", async () => {
    mod = freshAuth();

    await mod.sessionPlugin.hooks.onResponse({
      request: { url: SIGN_IN_URL },
      response: signInResponse(),
    });

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, raw] = mockSetItem.mock.calls[0];
    expect(key).toBe(SESSION_STORAGE_KEY);
    const jar = JSON.parse(raw as string);
    expect(Object.keys(jar).sort()).toEqual(["better-auth.session_data", "better-auth.session_token"]);
    expect(jar["better-auth.session_token"].value).toBe("tok.sig");
    expect(jar["better-auth.session_data"].value).toBe("abc");
  });

  test("regression: onResponse awaits the durable write and the AsyncStorage read before it", async () => {
    const write = deferred<void>();
    mockSetItem.mockReset();
    mockSetItem.mockImplementationOnce(() => {
      callOrder.push("setItem");
      return write.promise;
    });

    mod = freshAuth();

    let settled = false;
    const pending = mod.sessionPlugin.hooks.onResponse({
      request: { url: SIGN_IN_URL },
      response: signInResponse(),
    }).then(() => {
      settled = true;
    });

    await flushMicrotasks();

    expect(callOrder).toEqual(["getItem", "setItem"]);
    expect(settled).toBe(false);

    write.resolve();
    await pending;
    expect(settled).toBe(true);
  });

  test("cold-restart replay: onRequest returns credentials omit and the stored cookie header, dropping expired cookies", async () => {
    const now = Date.now();
    storedValue = JSON.stringify({
      "better-auth.session_token": { value: "tok.sig", expires: now + 604800000 },
      "better-auth.session_data": { value: "abc", expires: now + 1209600000 },
      "better-auth.session_stale": { value: "gone", expires: now - 1000 },
    });

    mod = freshAuth();
    const result = await mod.sessionPlugin.hooks.onRequest({ headers: {}, request: { url: AUTH_URL + "/get-session" } });

    expect(result.credentials).toBe("omit");
    expect(result.headers.get("cookie")).toBe("better-auth.session_token=tok.sig; better-auth.session_data=abc");
  });

  test("sign-out clear: onResponse empties the jar and removes the stored session", async () => {
    const now = Date.now();
    storedValue = JSON.stringify({
      "better-auth.session_token": { value: "tok.sig", expires: now + 604800000 },
    });

    mod = freshAuth();

    await mod.sessionPlugin.hooks.onResponse({
      request: { url: SIGN_OUT_URL },
      response: { ok: true, headers: rnHeaders({ "set-cookie": SIGN_OUT_SET_COOKIE }) },
    });

    expect(mockRemoveItem).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(storedValue).toBeNull();
    await expect(mod.sessionCookieHeader()).resolves.toBe("");
  });

  test("resilience: a rejected write never rejects onResponse and warns once", async () => {
    mockSetItem.mockReset();
    mockSetItem.mockImplementation(() => {
      callOrder.push("setItem");
      return Promise.reject(new Error("disk full"));
    });

    mod = freshAuth();

    await expect(
      mod.sessionPlugin.hooks.onResponse({ request: { url: SIGN_IN_URL }, response: signInResponse() }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith("Could not save your sign-in on this device.");
  });

  test("resilience: a rejected read yields no cookie header and a later call retries the read", async () => {
    mockGetItem.mockReset();
    mockGetItem.mockImplementation(() => Promise.reject(new Error("unreadable")));

    mod = freshAuth();

    const first = await mod.sessionPlugin.hooks.onRequest({ headers: {}, request: { url: AUTH_URL } });
    expect(first.credentials).toBe("omit");
    expect(first.headers.get("cookie")).toBeNull();
    expect(mockGetItem).toHaveBeenCalledTimes(1);

    const second = await mod.sessionPlugin.hooks.onRequest({ headers: {}, request: { url: AUTH_URL } });
    expect(second.credentials).toBe("omit");
    expect(second.headers.get("cookie")).toBeNull();
    expect(mockGetItem).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith("Could not read your saved sign-in on this device.");
  });
});
