import { deleteAccount, updatePassword } from "./actions";
import { AUTH_REDIRECT_URL, PASSWORD_RESET_AVAILABLE, WRONG_CURRENT_PASSWORD } from "./constants";

jest.mock("../db", () => {
  const changePassword = jest.fn(async () => ({}));
  const deleteUser = jest.fn(async () => ({}));
  const signOut = jest.fn(async () => ({}));
  return {
    db: {
      auth: {
        getBetterAuthInstance: jest.fn(() => ({ changePassword, deleteUser })),
        signOut,
      },
    },
    authCall: jest.fn(async () => ({ ok: true, status: 200, error: null })),
  };
});

jest.mock("../db/data", () => ({
  upsertProfile: jest.fn(async () => ({ data: null, error: null })),
}));

jest.mock("../db/config", () => ({
  BACKEND_AUTH_URL: "http://localhost:3000/api/auth",
  IN_BROWSER: false,
  borelHeaders: jest.fn(() => ({ "X-Borel-Surface": "dev" })),
  backendDataUrl: jest.fn(() => "http://localhost:3000/api/data"),
}));

const coreDb = jest.requireMock("../db") as {
  db: {
    auth: {
      getBetterAuthInstance: jest.Mock;
      signOut: jest.Mock;
    };
  };
  authCall: jest.Mock;
};

const getInstanceMock = coreDb.db.auth.getBetterAuthInstance;
const signOutMock = coreDb.db.auth.signOut;

function authInstance(): { changePassword: jest.Mock; deleteUser: jest.Mock } {
  return getInstanceMock() as { changePassword: jest.Mock; deleteUser: jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("updatePassword", () => {
  test("uses getBetterAuthInstance().changePassword as the passthrough", async () => {
    const better = authInstance();
    const res = await updatePassword("new-secret", "old-secret");
    expect(res).toEqual({ ok: true, needsEmailConfirmation: false, error: null });
    expect(better.changePassword).toHaveBeenCalledWith({
      newPassword: "new-secret",
      currentPassword: "old-secret",
      revokeOtherSessions: false,
    });
  });

  test("requires the current password and never reaches the client without it", async () => {
    const better = authInstance();
    const res = await updatePassword("new-secret");
    expect(res.ok).toBe(false);
    expect(better.changePassword).not.toHaveBeenCalled();
  });

  test("maps an invalid current password to the wrong-password sentence", async () => {
    const better = authInstance();
    better.changePassword.mockResolvedValueOnce({ error: { message: "Invalid password" } });
    const res = await updatePassword("new-secret", "wrong");
    expect(res).toEqual({ ok: false, needsEmailConfirmation: false, error: WRONG_CURRENT_PASSWORD });
  });
});

describe("deleteAccount", () => {
  test("uses getBetterAuthInstance().deleteUser and signs out afterwards", async () => {
    const better = authInstance();
    const res = await deleteAccount();
    expect(res).toEqual({ ok: true, needsEmailConfirmation: false, error: null });
    expect(better.deleteUser).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe("constants", () => {
  test("password reset is available and the redirect is the backend auth base", () => {
    expect(PASSWORD_RESET_AVAILABLE).toBe(true);
    expect(AUTH_REDIRECT_URL).toBe("http://localhost:3000/api/auth");
  });
});
