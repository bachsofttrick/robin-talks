import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { auth } from "./auth.js";
import { getDb } from "./db/index.js";
import { baseUrl, databaseUrlOrNull } from "./env.js";
import { outbox, resetOutbox } from "./mail/otp-transport.js";

const noDb = databaseUrlOrNull() === null;

if (noDb) {
  console.warn(
    "auth.e2e.test.ts: skipping auth integration checks, no DATABASE_URL or PG* variables configured",
  );
}

const origin = baseUrl();
const authBase = `${origin}/api/auth`;
const email = `robin-auth-${crypto.randomUUID()}@example.com`;
const password = "robin-talks-password-123";
const name = "Robin Auth Test";

let sessionCookie = "";

type CallResult = {
  status: number;
  body: string;
  response: Response;
};

async function call(request: Request): Promise<CallResult> {
  const response = await auth.handler(request);
  const body = await response.text();
  return { status: response.status, body, response };
}

function jsonRequest(path: string, payload: unknown): Request {
  return new Request(`${authBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

afterAll(async () => {
  if (noDb) return;
  await getDb().execute(sql`delete from "user" where email = ${email}`);
});

const skip = test.skipIf(noDb);

describe("auth sign-up and verification", () => {
  skip("AC-6: sign-up creates a user, OTP verifies the email, sign-in returns a session", async () => {
    resetOutbox();

    const signUp = await call(jsonRequest("/sign-up/email", { email, password, name }));
    expect(signUp.status, `POST /sign-up/email -> ${signUp.status}: ${signUp.body}`).toBe(200);

    const signUpBody = JSON.parse(signUp.body) as { token: string | null };
    expect(
      signUpBody.token,
      `expected no session token after sign-up, got ${signUp.body}`,
    ).toBeNull();
    expect(
      signUp.response.headers.get("set-cookie"),
      `expected no session cookie after sign-up, got ${signUp.body}`,
    ).toBeNull();

    const entries = outbox.filter((entry) => entry.email === email);
    expect(
      entries.length,
      `expected exactly one outbox entry for ${email}, got ${JSON.stringify(outbox)}`,
    ).toBe(1);
    const [otpEntry] = entries;
    expect(otpEntry.type).toBe("email-verification");
    expect(otpEntry.otp).toMatch(/^\d{6}$/);

    const verify = await call(
      jsonRequest("/email-otp/verify-email", { email, otp: otpEntry.otp }),
    );
    expect(
      verify.status,
      `POST /email-otp/verify-email -> ${verify.status}: ${verify.body}`,
    ).toBe(200);
    expect(JSON.parse(verify.body)).toMatchObject({ status: true });

    const signIn = await call(jsonRequest("/sign-in/email", { email, password }));
    expect(signIn.status, `POST /sign-in/email -> ${signIn.status}: ${signIn.body}`).toBe(200);

    const setCookie = signIn.response.headers.get("set-cookie");
    expect(
      setCookie,
      `expected a set-cookie header from sign-in, got ${signIn.body}`,
    ).not.toBeNull();
    sessionCookie = cookieHeaderFrom(signIn.response);
  });
});

describe("auth session lifecycle", () => {
  skip("AC-8: get-session returns the user, sign-out clears the session", async () => {
    const session = await call(
      new Request(`${authBase}/get-session`, { headers: { cookie: sessionCookie } }),
    );
    expect(
      session.status,
      `GET /get-session -> ${session.status}: ${session.body}`,
    ).toBe(200);
    const sessionBody = JSON.parse(session.body) as { user?: { email: string } } | null;
    expect(
      sessionBody?.user?.email,
      `expected the signed-in user, got ${session.body}`,
    ).toBe(email);

    const signOut = await call(
      new Request(`${authBase}/sign-out`, {
        method: "POST",
        headers: { cookie: sessionCookie, origin },
      }),
    );
    expect(signOut.status, `POST /sign-out -> ${signOut.status}: ${signOut.body}`).toBe(200);

    const after = await call(
      new Request(`${authBase}/get-session`, { headers: { cookie: sessionCookie } }),
    );
    expect(
      after.status,
      `GET /get-session after sign-out -> ${after.status}: ${after.body}`,
    ).toBe(200);
    const afterBody = JSON.parse(after.body) as { user?: { email: string } } | null;
    expect(
      afterBody?.user ?? null,
      `expected no session after sign-out, got ${after.body}`,
    ).toBeNull();
  });
});
