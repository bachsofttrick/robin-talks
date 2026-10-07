import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

jest.mock("@neondatabase/neon-js", () => {
  const betterAuthInstance = { changePassword: jest.fn(), deleteUser: jest.fn() };
  return {
    createClient: jest.fn(() => ({
      auth: {
        signUp: jest.fn(),
        signInWithPassword: jest.fn(),
        verifyOtp: jest.fn(),
        signOut: jest.fn(),
        getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
        getBetterAuthInstance: () => betterAuthInstance,
      },
    })),
    SupabaseAuthAdapter: jest.fn(() => ({ kind: "adapter" })),
  };
});

const createClientMock = createClient as unknown as jest.Mock;
const adapterMock = SupabaseAuthAdapter as unknown as jest.Mock;

type BrowserAuthModule = typeof import("./browser-auth");
type ConfigModule = typeof import("./config");

const ENV = {
  EXPO_PUBLIC_BACKEND_URL: "http://localhost:3000/api",
  EXPO_PUBLIC_AUTH_URL: "https://borel.example/auth",
  EXPO_PUBLIC_PREVIEW_AUTH_URL: "https://preview.borel.example",
};

const originalEnv = { ...process.env };

describe("browser-auth", () => {
  let mod: BrowserAuthModule;
  let cfg: ConfigModule;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_BACKEND_URL = ENV.EXPO_PUBLIC_BACKEND_URL;
    process.env.EXPO_PUBLIC_AUTH_URL = ENV.EXPO_PUBLIC_AUTH_URL;
    process.env.EXPO_PUBLIC_PREVIEW_AUTH_URL = ENV.EXPO_PUBLIC_PREVIEW_AUTH_URL;
    (globalThis as any).document = {};

    jest.isolateModules(() => {
      cfg = jest.requireActual("./config") as ConfigModule;
      mod = jest.requireActual("./browser-auth") as BrowserAuthModule;
    });
  });

  afterAll(() => {
    delete (globalThis as any).document;
    for (const key of Object.keys(ENV)) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test("builds the underlying client against the backend auth url and data api", () => {
    const options = createClientMock.mock.calls[0][0];
    expect(options.auth.url).toBe("http://localhost:3000/api/auth");
    expect(options.auth.url).toBe(ENV.EXPO_PUBLIC_BACKEND_URL + "/auth");
    expect(options.auth.url).not.toBe(cfg.AUTH_URL);
    expect(options.auth.url).not.toBe(cfg.PREVIEW_AUTH_URL);
    expect(options.auth.adapter).toBe(adapterMock.mock.results[0].value);
    expect(typeof options.dataApi).toBe("object");
    expect(options.dataApi.url).toBe("http://localhost:3000/api/data");
  });

  test("adapter is built with no plugins and no credentials override", () => {
    expect(adapterMock).toHaveBeenCalledTimes(1);
    expect(adapterMock).toHaveBeenCalledWith();
    const adapterOptions = adapterMock.mock.calls[0]?.[0];
    expect(adapterOptions?.fetchOptions?.plugins).toBeUndefined();
    expect(adapterOptions?.fetchOptions?.credentials).toBeUndefined();
  });

  test("brokerAuth exposes onAuthStateChange and getBetterAuthInstance", () => {
    expect(typeof mod.brokerAuth.onAuthStateChange).toBe("function");
    expect(typeof mod.brokerAuth.getBetterAuthInstance).toBe("function");
  });

  test("getBetterAuthInstance returns the underlying instance unchanged", () => {
    const underlying = createClientMock.mock.results[0].value.auth;
    expect(mod.brokerAuth.getBetterAuthInstance()).toBe(underlying.getBetterAuthInstance());
  });

  test("onAuthStateChange returns a subscription and unsubscribe stops notifications", async () => {
    const listener = jest.fn();
    const result = mod.brokerAuth.onAuthStateChange(listener);
    expect(result).toEqual({ data: { subscription: { unsubscribe: expect.any(Function) } } });
    result.data.subscription.unsubscribe();

    const auth = createClientMock.mock.results[0].value.auth;
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: null });
    await mod.brokerAuth.signInWithPassword({ email: "a@b.c", password: "x" });

    expect(listener).not.toHaveBeenCalled();
  });

  test("signInWithPassword, verifyOtp and signOut notify subscribers with the session", async () => {
    let current: { user: { id: string } } | null = { user: { id: "u1" } };
    const fakeAuth = {
      signUp: jest.fn(async () => ({ data: { session: current }, error: null })),
      signInWithPassword: jest.fn(async () => ({ data: { session: current }, error: null })),
      verifyOtp: jest.fn(async () => ({ data: { session: current }, error: null })),
      signOut: jest.fn(async () => {
        current = null;
        return { error: null };
      }),
      getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
    };
    const wrapper = mod.createBrowserAuth(fakeAuth);
    const listener = jest.fn();
    const { data } = wrapper.onAuthStateChange(listener);

    await wrapper.signInWithPassword({ email: "a@b.c", password: "x" });
    expect(listener).toHaveBeenLastCalledWith("SIGNED_IN", { user: { id: "u1" } });
    expect(fakeAuth.getSession).toHaveBeenLastCalledWith({ forceFetch: true });

    current = { user: { id: "u1" } };
    await wrapper.verifyOtp({ type: "signup", email: "a@b.c", token: "123456" });
    expect(listener).toHaveBeenLastCalledWith("SIGNED_IN", { user: { id: "u1" } });

    await wrapper.signOut();
    expect(listener).toHaveBeenLastCalledWith("SIGNED_OUT", null);

    expect(listener.mock.calls).toEqual([
      ["SIGNED_IN", { user: { id: "u1" } }],
      ["SIGNED_IN", { user: { id: "u1" } }],
      ["SIGNED_OUT", null],
    ]);

    data.subscription.unsubscribe();
  });
});
