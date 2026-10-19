import React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { db } from "../db";
import { sessionCookieHeader } from "../db/auth";
import { syncProfile } from "./actions";
import { AuthProvider, useAuth, useKitSession } from "./context";
import type { Session } from "./types";

jest.mock("../db", () => ({
  db: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } },
}));

jest.mock("./actions", () => ({ syncProfile: jest.fn() }));
jest.mock("../db/auth", () => ({ sessionCookieHeader: jest.fn() }));
jest.mock("../db/config", () => ({ IN_BROWSER: false }));

const getSessionMock = db.auth.getSession as jest.Mock;
const sessionCookieHeaderMock = sessionCookieHeader as jest.Mock;
const onAuthStateChangeMock = db.auth.onAuthStateChange as jest.Mock;
const SESSION: Session = { user: { id: "u1", email: "ana@example.com" } };
const OTHER_SESSION: Session = { user: { id: "u2", email: "ben@example.com" } };
const sessionResult = (session: Session | null) => ({ data: { session }, error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

let handleAuthChange: (event: string, session: Session | null) => void;
let handleAppStateChange: (state: AppStateStatus) => void;
const unsubscribe = jest.fn();
const removeAppStateListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  sessionCookieHeaderMock.mockReset().mockResolvedValue("session=stored");
  getSessionMock.mockReset().mockResolvedValue(sessionResult(SESSION));
  onAuthStateChangeMock.mockImplementation((callback) => {
    handleAuthChange = callback;
    return { data: { subscription: { unsubscribe } } };
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
    handleAppStateChange = callback;
    return { remove: removeAppStateListener };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("settles signed out without fetching when native has no stored cookies", async () => {
  sessionCookieHeaderMock.mockResolvedValue("");
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  expect(getSessionMock).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
  expect(result.current.signedIn).toBe(false);
});

test("a newer auth event supersedes a pending cookie read", async () => {
  const cookies = deferred<string>();
  sessionCookieHeaderMock.mockReturnValueOnce(cookies.promise);
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  await act(async () => { handleAuthChange("SIGNED_IN", SESSION); });
  await act(async () => { cookies.resolve(""); });

  expect(getSessionMock).not.toHaveBeenCalled();
  expect(result.current.session).toEqual(SESSION);
});

test("owns startup hydration and ignores the adapter's stale initial session", async () => {
  const startup = deferred<ReturnType<typeof sessionResult>>();
  getSessionMock.mockReturnValueOnce(startup.promise);
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  expect(getSessionMock).toHaveBeenCalledWith({ forceFetch: true });
  await act(async () => { handleAuthChange("INITIAL_SESSION", null); });
  expect(result.current.loading).toBe(true);

  await act(async () => { startup.resolve(sessionResult(SESSION)); });
  expect(result.current.user).toEqual(SESSION.user);
  expect(result.current.loading).toBe(false);
  expect(syncProfile).toHaveBeenCalledWith(SESSION.user);

  await act(async () => { handleAuthChange("INITIAL_SESSION", null); });
  expect(result.current.signedIn).toBe(true);
});

test.each([
  ["SIGNED_IN", OTHER_SESSION],
  ["SIGNED_OUT", null],
] as const)("a newer %s event supersedes an outstanding restoration", async (event, session) => {
  const startup = deferred<ReturnType<typeof sessionResult>>();
  getSessionMock.mockReturnValueOnce(startup.promise);
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  await act(async () => { handleAuthChange(event, session); });
  await act(async () => { startup.resolve(sessionResult(SESSION)); });

  expect(result.current.session).toEqual(session);
  expect(result.current.loading).toBe(false);
});

test("retries returned and thrown errors before completing startup", async () => {
  getSessionMock
    .mockResolvedValueOnce({ data: { session: null }, error: { message: "Unavailable" } })
    .mockRejectedValueOnce(new Error("Network request failed"));
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  expect(result.current.loading).toBe(true);
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(result.current.loading).toBe(true);
  await act(async () => { jest.advanceTimersByTime(1500); });

  expect(getSessionMock).toHaveBeenCalledTimes(3);
  expect(result.current.session).toEqual(SESSION);
  expect(result.current.loading).toBe(false);
});

test("settles after bounded failures and recovers when the app returns to the foreground", async () => {
  getSessionMock.mockRejectedValue(new Error("Offline"));
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { jest.advanceTimersByTime(1500); });

  expect(getSessionMock).toHaveBeenCalledTimes(3);
  expect(result.current.loading).toBe(false);
  expect(result.current.signedIn).toBe(false);

  getSessionMock.mockResolvedValue(sessionResult(SESSION));
  await act(async () => { handleAppStateChange("background"); });
  expect(getSessionMock).toHaveBeenCalledTimes(3);
  await act(async () => { handleAppStateChange("active"); });
  expect(result.current.session).toEqual(SESSION);
});

test("keeps an established session on transport failure but accepts a validated sign-out", async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });
  getSessionMock.mockRejectedValue(new Error("Offline"));

  await act(async () => { handleAppStateChange("active"); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(result.current.session).toEqual(SESSION);

  getSessionMock.mockResolvedValue(sessionResult(null));
  await act(async () => { handleAppStateChange("active"); });
  expect(result.current.user).toBeNull();
  expect(result.current.signedIn).toBe(false);
});

test("a real auth event cancels a scheduled startup retry", async () => {
  getSessionMock.mockRejectedValueOnce(new Error("Offline"));
  const { result } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  await act(async () => { handleAuthChange("SIGNED_OUT", null); });
  await act(async () => { jest.advanceTimersByTime(2000); });

  expect(getSessionMock).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.signedIn).toBe(false);
});

test("unmount cancels retries and removes both subscriptions", async () => {
  getSessionMock.mockRejectedValueOnce(new Error("Offline"));
  const { unmount } = await renderHook(() => useAuth(), { wrapper: Wrapper });

  await unmount();
  await act(async () => { jest.advanceTimersByTime(2000); });

  expect(getSessionMock).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(removeAppStateListener).toHaveBeenCalledTimes(1);
});

test("providerless account UI uses the same restoration path", async () => {
  const { result } = await renderHook(() => useKitSession());

  expect(getSessionMock).toHaveBeenCalledWith({ forceFetch: true });
  expect(result.current.session).toEqual(SESSION);
});

test("account UI inside the provider shares its session and subscriptions", async () => {
  const { result } = await renderHook(() => useKitSession(), { wrapper: Wrapper });

  expect(getSessionMock).toHaveBeenCalledTimes(1);
  expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
  expect(result.current.session).toEqual(SESSION);
});
