import { afterEach, describe, expect, test } from "bun:test";
import { createAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla";

const BASE_URL = "http://localhost:3000/api/auth";

const EXPECTED_PATHS = [
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
  "/api/auth/get-session",
  "/api/auth/email-otp/verify-email",
  "/api/auth/email-otp/send-verification-otp",
  "/api/auth/delete-user",
];

describe("AC-13: Supabase adapter path conformance", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("adapter methods request the better-auth paths the mobile client issues", async () => {
    const recorded: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      recorded.push(`${init?.method} ${url}`);
      return Response.json({}, { status: 200 });
    }) as typeof fetch;

    const auth = createAuthClient(BASE_URL, { adapter: SupabaseAuthAdapter() });
    const email = "conformance@example.com";
    const password = "password-123";

    await auth.signUp({ email, password });
    await auth.signInWithPassword({ email, password });
    await auth.signOut();
    await auth.getSession();
    await auth.verifyOtp({ email, token: "123456", type: "signup" });
    await auth.signInWithOtp({ email });

    const betterAuth = auth.getBetterAuthInstance();
    await betterAuth.changePassword({
      newPassword: "password-123",
      currentPassword: "password-123",
      revokeOtherSessions: false,
    });
    await betterAuth.deleteUser();

    const calls = recorded.map((call) => {
      const [method, url] = call.split(" ");
      return `${method} ${new URL(url).pathname}`;
    });

    for (const path of EXPECTED_PATHS) {
      expect(
        recorded.some((call) => call.includes(path)),
        `expected a request to ${path}, recorded ${JSON.stringify(recorded)}`,
      ).toBe(true);
    }

    expect(calls, `recorded ${JSON.stringify(recorded)}`).toContain(
      "POST /api/auth/change-password",
    );
    expect(calls, `recorded ${JSON.stringify(recorded)}`).toContain(
      "POST /api/auth/delete-user",
    );
  });
});