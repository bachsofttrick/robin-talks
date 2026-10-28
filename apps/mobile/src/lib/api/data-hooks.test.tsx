import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useMemory } from "./useMemory";
import { useProfile } from "./useProfile";
import { useSessions } from "./useSessions";
import { syncProfile } from "../core/auth/actions";
import { useAuth } from "../core/auth";
import { db } from "../core/db";
import * as data from "../core/db/data";

jest.mock("../core/auth", () => ({ useAuth: jest.fn() }));

jest.mock("../core/db/config", () => ({
  ...jest.requireActual("../core/db/config"),
  IN_BROWSER: false,
}));

jest.mock("../core/db", () => {
  const { plainError } = jest.requireActual("../core/db/errors");
  return {
    db: {
      from: jest.fn(() => {
        throw new Error("Borel db.from reached");
      }),
    },
    plainError,
  };
});

jest.mock("../core/db/data", () => ({
  getProfile: jest.fn(async () => ({
    data: { user_id: "u1", display_name: "Ana", level: "Beginner" },
    error: null,
  })),
  saveProfile: jest.fn(async () => ({ data: null, error: null })),
  getOpenSession: jest.fn(async () => ({ data: null, error: null })),
  createSession: jest.fn(async () => ({ data: { id: "s1" }, error: null })),
  getSession: jest.fn(async () => ({ data: null, error: null })),
  updateSession: jest.fn(async () => ({ data: null, error: null })),
  getRecentSessions: jest.fn(async () => ({ data: [], error: null })),
  deleteAllSessions: jest.fn(async () => ({ data: null, error: null })),
  listMemory: jest.fn(async () => ({ data: [], error: null })),
  addMemory: jest.fn(async () => ({ data: { id: "m1" }, error: null })),
  deleteAllMemory: jest.fn(async () => ({ data: null, error: null })),
  upsertProfile: jest.fn(async () => ({ data: null, error: null })),
}));

jest.mock("../core/borel/borel-store", () => {
  const { useSyncExternalStore } = jest.requireActual("react");
  const state: { value: unknown } = {
    value: { displayName: "", level: "Beginner", onboarded: false },
  };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const store = {
    use: () => useSyncExternalStore(subscribe, () => state.value),
    useStatus: () => ({ ready: true, error: null, detail: null, retry: jest.fn() }),
    get: () => state.value,
    set: (next: unknown) => {
      state.value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe,
  };
  return { createStore: () => store };
});

const getProfileMock = data.getProfile as unknown as jest.Mock;
const useAuthMock = useAuth as jest.Mock;
const saveProfileMock = data.saveProfile as unknown as jest.Mock;
const getOpenSessionMock = data.getOpenSession as unknown as jest.Mock;
const createSessionMock = data.createSession as unknown as jest.Mock;
const getSessionMock = data.getSession as unknown as jest.Mock;
const updateSessionMock = data.updateSession as unknown as jest.Mock;
const deleteAllSessionsMock = data.deleteAllSessions as unknown as jest.Mock;
const listMemoryMock = data.listMemory as unknown as jest.Mock;
const addMemoryMock = data.addMemory as unknown as jest.Mock;
const deleteAllMemoryMock = data.deleteAllMemory as unknown as jest.Mock;
const upsertProfileMock = data.upsertProfile as unknown as jest.Mock;

const fromMock = (db as unknown as { from: jest.Mock }).from;

const LOAD_FAILED = "Couldn't load this right now, so please try again.";
const SAVE_FAILED = "That didn't save, so check your connection and try again.";

function deferredProfile() {
  let resolve!: (value: Awaited<ReturnType<typeof data.getProfile>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof data.getProfile>>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: "u1", email: "u1@example.com" } });
  getProfileMock.mockReset().mockResolvedValue({
    data: { user_id: "u1", display_name: "Ana", level: "Beginner" },
    error: null,
  });
});

describe("useProfile", () => {
  test("same-account auth refresh preserves profile, callbacks, and loaded state", async () => {
    const loadingStates: boolean[] = [];
    const { result, rerender } = await renderHook(() => {
      const profile = useProfile();
      loadingStates.push(profile.loading);
      return profile;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { data: profile, reload, save } = result.current;
    loadingStates.length = 0;
    getProfileMock.mockImplementationOnce(() => new Promise(() => {}));

    useAuthMock.mockReturnValue({ user: { id: "u1", email: "updated@example.com" } });
    await rerender({});

    expect(loadingStates).not.toContain(true);
    expect(getProfileMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(profile);
    expect(result.current.reload).toBe(reload);
    expect(result.current.save).toBe(save);
  });

  test("explicit reload still fetches and shows loading", async () => {
    const { result } = await renderHook(() => useProfile());
    const pending = deferredProfile();
    getProfileMock.mockReturnValueOnce(pending.promise);
    let reload!: Promise<void>;
    await act(async () => {
      reload = result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    expect(getProfileMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve({ data: null, error: null });
      await reload;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data.onboarded).toBe(false);
  });

  test("account changes load the new profile and signout clears it", async () => {
    const { result, rerender } = await renderHook(() => useProfile());
    const pending = deferredProfile();
    getProfileMock.mockReturnValueOnce(pending.promise);
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    await rerender({});
    expect(getProfileMock).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pending.resolve({
        data: { user_id: "u2", display_name: "Bo", level: "Advanced" },
        error: null,
      });
    });
    expect(result.current.data).toEqual({ displayName: "Bo", level: "Advanced", onboarded: true });
    expect(result.current.loading).toBe(false);

    useAuthMock.mockReturnValue({ user: null });
    await rerender({});
    expect(result.current.data).toEqual({ displayName: "", level: "Beginner", onboarded: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getProfileMock).toHaveBeenCalledTimes(2);
    await expect(result.current.save("Ana", "Beginner")).resolves.toBe("You need an account first.");
    expect(saveProfileMock).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue({ user: { id: "u1" } });
    await rerender({});
    expect(getProfileMock).toHaveBeenCalledTimes(3);
    expect(result.current.data.displayName).toBe("Ana");
  });

  test.each([
    { data: { user_id: "u1", display_name: "Old", level: "Beginner" }, error: null },
    { data: null, error: { message: "old account load failed" } },
  ])("old account result %j cannot complete the new account's load", async (oldResult) => {
    const oldLoad = deferredProfile();
    const newLoad = deferredProfile();
    getProfileMock.mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(newLoad.promise);
    const { result, rerender } = await renderHook(() => useProfile());
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    await rerender({});
    const profileBefore = result.current.data;

    await act(async () => { oldLoad.resolve(oldResult); });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(profileBefore);

    await act(async () => {
      newLoad.resolve({
        data: { user_id: "u2", display_name: "Bo", level: "Advanced" },
        error: null,
      });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data.displayName).toBe("Bo");
  });

  test("a pending load cannot restore profile data after signout", async () => {
    const pending = deferredProfile();
    getProfileMock.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await renderHook(() => useProfile());
    useAuthMock.mockReturnValue({ user: null });
    await rerender({});

    await act(async () => {
      pending.resolve({
        data: { user_id: "u1", display_name: "Old", level: "Beginner" },
        error: null,
      });
    });
    expect(result.current.data).toEqual({ displayName: "", level: "Beginner", onboarded: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("an unmounted hook's pending load cannot overwrite the shared profile", async () => {
    const pending = deferredProfile();
    getProfileMock.mockReturnValueOnce(pending.promise);
    const oldHook = await renderHook(() => useProfile());
    await oldHook.unmount();
    const { result } = await renderHook(() => useProfile());
    expect(result.current.data.displayName).toBe("Ana");

    await act(async () => {
      pending.resolve({
        data: { user_id: "u1", display_name: "Old", level: "Beginner" },
        error: null,
      });
    });
    expect(result.current.data.displayName).toBe("Ana");
  });

  test("a pending save cannot overwrite a different account's profile", async () => {
    const { result, rerender } = await renderHook(() => useProfile());
    const pending = deferredProfile();
    saveProfileMock.mockReturnValueOnce(pending.promise);
    let save!: Promise<string | null>;
    await act(async () => { save = result.current.save("Old edit", "Advanced"); });
    useAuthMock.mockReturnValue({ user: { id: "u2" } });
    getProfileMock.mockResolvedValueOnce({
      data: { user_id: "u2", display_name: "Bo", level: "Beginner" },
      error: null,
    });
    await rerender({});

    await act(async () => {
      pending.resolve({ data: null, error: null });
      await save;
    });
    expect(result.current.data.displayName).toBe("Bo");
    await expect(save).resolves.toBeNull();
  });

  test("loads through getProfile on mount", async () => {
    await renderHook(() => useProfile());
    await waitFor(() => expect(getProfileMock).toHaveBeenCalledTimes(1));
  });

  test("save forwards to saveProfile", async () => {
    const { result } = await renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save("Ana", "Beginner");
    });
    expect(saveProfileMock).toHaveBeenCalledWith("Ana", "Beginner");
    expect(result.current.data).toEqual({ displayName: "Ana", level: "Beginner", onboarded: true });
  });

  test("a failed load carries the plain load sentence", async () => {
    getProfileMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { result } = await renderHook(() => useProfile());
    await waitFor(() => expect(result.current.error).toBe(LOAD_FAILED));
  });

  test("a failed save returns the plain save sentence", async () => {
    saveProfileMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { result } = await renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let message: string | null = null;
    await act(async () => {
      message = await result.current.save("Ana", "Beginner");
    });
    expect(message).toBe(SAVE_FAILED);
  });

  test("keeps the public shape", async () => {
    const { result } = await renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current).sort()).toEqual(
      ["data", "loading", "error", "reload", "save"].sort(),
    );
  });
});

describe("useMemory", () => {
  test("loads through listMemory on mount", async () => {
    await renderHook(() => useMemory());
    await waitFor(() => expect(listMemoryMock).toHaveBeenCalledTimes(1));
  });

  test("remember forwards to addMemory", async () => {
    const { result } = await renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remember("k", "c");
    });
    expect(addMemoryMock).toHaveBeenCalledWith("k", "c");
  });

  test("clearAll forwards to deleteAllMemory", async () => {
    const { result } = await renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.clearAll();
    });
    expect(deleteAllMemoryMock).toHaveBeenCalledTimes(1);
  });

  test("keeps the public shape", async () => {
    const { result } = await renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current).sort()).toEqual(
      ["data", "loading", "error", "reload", "remember", "clearAll"].sort(),
    );
  });
});

describe("useSessions", () => {
  test("loads through getOpenSession on mount", async () => {
    await renderHook(() => useSessions());
    await waitFor(() => expect(getOpenSessionMock).toHaveBeenCalledTimes(1));
  });

  test("create forwards to createSession", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create("sc");
    });
    expect(createSessionMock).toHaveBeenCalledWith("sc");
  });

  test("fetchOne forwards to getSession", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.fetchOne("id");
    });
    expect(getSessionMock).toHaveBeenCalledWith("id");
  });

  test("saveTranscript forwards to updateSession", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.saveTranscript("id", []);
    });
    expect(updateSessionMock).toHaveBeenCalledWith("id", { transcript: [] });
  });

  test("clearAll forwards to deleteAllSessions", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.clearAll();
    });
    expect(deleteAllSessionsMock).toHaveBeenCalledTimes(1);
  });

  test("keeps the public shape", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current).sort()).toEqual(
      [
        "open",
        "loading",
        "error",
        "reload",
        "create",
        "fetchOne",
        "saveTranscript",
        "finish",
        "recent",
        "clearAll",
      ].sort(),
    );
  });
});

describe("backend data client on both surfaces", () => {
  test("useProfile reaches ../core/db/data and never Borel db.from", async () => {
    const { result } = await renderHook(() => useProfile());
    await waitFor(() => expect(getProfileMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromMock).not.toHaveBeenCalled();
    expect(Object.keys(result.current).sort()).toEqual(
      ["data", "loading", "error", "reload", "save"].sort(),
    );
  });

  test("useSessions reaches ../core/db/data and never Borel db.from", async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => expect(getOpenSessionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromMock).not.toHaveBeenCalled();
    expect(Object.keys(result.current).sort()).toEqual(
      [
        "open",
        "loading",
        "error",
        "reload",
        "create",
        "fetchOne",
        "saveTranscript",
        "finish",
        "recent",
        "clearAll",
      ].sort(),
    );
  });

  test("useMemory reaches ../core/db/data and never Borel db.from", async () => {
    const { result } = await renderHook(() => useMemory());
    await waitFor(() => expect(listMemoryMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromMock).not.toHaveBeenCalled();
    expect(Object.keys(result.current).sort()).toEqual(
      ["data", "loading", "error", "reload", "remember", "clearAll"].sort(),
    );
  });
});

describe("syncProfile", () => {
  test("upserts the profile with mapped snake_case fields", async () => {
    await syncProfile({ id: "sync-1", email: "ana@example.com", name: "Ana", image: null });
    expect(upsertProfileMock).toHaveBeenCalledWith({
      email: "ana@example.com",
      display_name: "Ana",
      avatar_url: null,
    });
  });
});
