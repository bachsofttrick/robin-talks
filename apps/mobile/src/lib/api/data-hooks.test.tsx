import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useMemory } from "./useMemory";
import { useProfile } from "./useProfile";
import { useSessions } from "./useSessions";
import { syncProfile } from "../core/auth/actions";
import { db } from "../core/db";
import * as data from "../core/db/data";

jest.mock("../core/auth", () => {
  const user = { id: "u1", email: "u1@example.com" };
  return { useAuth: () => ({ user }) };
});

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
  const state: { value: unknown } = {
    value: { displayName: "", level: "Beginner", onboarded: false },
  };
  const store = {
    use: () => state.value,
    useStatus: () => ({ ready: true, error: null, detail: null, retry: jest.fn() }),
    get: () => state.value,
    set: (next: unknown) => {
      state.value = next;
    },
    subscribe: () => () => {},
  };
  return { createStore: () => store };
});

const getProfileMock = data.getProfile as unknown as jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useProfile", () => {
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
