import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { auth } from "./auth.js";
import { account, getDb, session, user } from "./db/index.js";
import { baseUrl, databaseUrlOrNull } from "./env.js";
import { outbox, resetOutbox, type OtpPayload, type OtpType } from "./mail/otp-transport.js";

const noDb = databaseUrlOrNull() === null;

if (noDb) {
  console.warn(
    "auth.e2e.test.ts: skipping auth integration checks, no DATABASE_URL or PG* variables configured",
  );
}

const origin = baseUrl();
const authBase = `${origin}/api/auth`;
const password = "robin-talks-password-123";
const name = "Robin Auth Test";

const createdEmails: string[] = [];

function uniqueEmail(): string {
  const address = `robin-auth-${crypto.randomUUID()}@example.com`;
  createdEmails.push(address);
  return address;
}

const email = uniqueEmail();

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

function cookieRequest(path: string, cookie: string, payload: unknown): Request {
  return new Request(`${authBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify(payload),
  });
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function signUp(address: string, pw = password): Promise<CallResult> {
  return call(jsonRequest("/sign-up/email", { email: address, password: pw, name }));
}

async function signIn(address: string, pw: string): Promise<CallResult> {
  return call(jsonRequest("/sign-in/email", { email: address, password: pw }));
}

function otpFor(address: string, type: OtpType): OtpPayload {
  const entry = outbox.find((item) => item.email === address && item.type === type);
  expect(
    entry,
    `expected a ${type} outbox entry for ${address}, got ${JSON.stringify(outbox)}`,
  ).toBeDefined();
  if (!entry) throw new Error(`missing ${type} outbox entry for ${address}`);
  return entry;
}

async function verifyEmail(address: string): Promise<void> {
  const entry = otpFor(address, "email-verification");
  const verify = await call(
    jsonRequest("/email-otp/verify-email", { email: address, otp: entry.otp }),
  );
  expect(
    verify.status,
    `POST /email-otp/verify-email -> ${verify.status}: ${verify.body}`,
  ).toBe(200);
}

async function signUpVerified(address: string, pw = password): Promise<void> {
  resetOutbox();
  const result = await signUp(address, pw);
  expect(result.status, `POST /sign-up/email -> ${result.status}: ${result.body}`).toBe(200);
  await verifyEmail(address);
}

afterAll(async () => {
  if (noDb) return;
  for (const address of createdEmails) {
    await getDb().delete(user).where(eq(user.email, address));
  }
});

const skip = test.skipIf(noDb);

describe("auth sign-up and verification", () => {
  skip("AC-6: sign-up creates a user, OTP verifies the email, sign-in returns a session", async () => {
    resetOutbox();

    const signUpResult = await call(jsonRequest("/sign-up/email", { email, password, name }));
    expect(
      signUpResult.status,
      `POST /sign-up/email -> ${signUpResult.status}: ${signUpResult.body}`,
    ).toBe(200);

    const signUpBody = JSON.parse(signUpResult.body) as { token: string | null };
    expect(
      signUpBody.token,
      `expected no session token after sign-up, got ${signUpResult.body}`,
    ).toBeNull();
    expect(
      signUpResult.response.headers.get("set-cookie"),
      `expected no session cookie after sign-up, got ${signUpResult.body}`,
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

    const signInResult = await call(jsonRequest("/sign-in/email", { email, password }));
    expect(
      signInResult.status,
      `POST /sign-in/email -> ${signInResult.status}: ${signInResult.body}`,
    ).toBe(200);

    const setCookie = signInResult.response.headers.get("set-cookie");
    expect(
      setCookie,
      `expected a set-cookie header from sign-in, got ${signInResult.body}`,
    ).not.toBeNull();
    sessionCookie = cookieHeaderFrom(signInResult.response);
  });
});

describe("auth session lifecycle", () => {
  skip("AC-8: get-session returns the user, sign-out clears the session", async () => {
    const sessionResult = await call(
      new Request(`${authBase}/get-session`, { headers: { cookie: sessionCookie } }),
    );
    expect(
      sessionResult.status,
      `GET /get-session -> ${sessionResult.status}: ${sessionResult.body}`,
    ).toBe(200);
    const sessionBody = JSON.parse(sessionResult.body) as { user?: { email: string } } | null;
    expect(
      sessionBody?.user?.email,
      `expected the signed-in user, got ${sessionResult.body}`,
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

describe("auth recovery and verification re-send", () => {
  skip("AC-7: unverified sign-in is refused and re-sends a fresh email-verification OTP", async () => {
    const address = uniqueEmail();

    resetOutbox();
    const signUpResult = await signUp(address);
    expect(
      signUpResult.status,
      `POST /sign-up/email -> ${signUpResult.status}: ${signUpResult.body}`,
    ).toBe(200);

    resetOutbox();
    const signInResult = await signIn(address, password);
    expect(
      signInResult.status,
      `POST /sign-in/email for an unverified account -> ${signInResult.status}: ${signInResult.body}`,
    ).toBe(403);
    const signInBody = JSON.parse(signInResult.body) as { code?: string };
    expect(
      signInBody.code,
      `expected EMAIL_NOT_VERIFIED from sign-in, got ${signInResult.body}`,
    ).toBe("EMAIL_NOT_VERIFIED");

    const afterSignIn = outbox.filter((entry) => entry.email === address);
    expect(
      afterSignIn.length,
      `expected sign-in to send one fresh code, got ${JSON.stringify(outbox)}`,
    ).toBe(1);
    const firstOtp = otpFor(address, "email-verification").otp;

    const send = await call(
      jsonRequest("/email-otp/send-verification-otp", {
        email: address,
        type: "email-verification",
      }),
    );
    expect(
      send.status,
      `POST /email-otp/send-verification-otp -> ${send.status}: ${send.body}`,
    ).toBe(200);

    const afterSend = outbox.filter(
      (entry) => entry.email === address && entry.type === "email-verification",
    );
    expect(
      afterSend.length,
      `expected a second outbox entry after send-verification-otp, got ${JSON.stringify(outbox)}`,
    ).toBe(2);
    expect(
      afterSend[1].otp,
      `expected a fresh otp, got the same code ${firstOtp}`,
    ).not.toBe(firstOtp);
  });

  skip("AC-9: forget-password issues a reset code, reset-password changes it, and unknown emails do not enumerate", async () => {
    const address = uniqueEmail();
    const newPassword = "robin-talks-reset-password-456";
    await signUpVerified(address);

    resetOutbox();
    const forget = await call(jsonRequest("/forget-password/email-otp", { email: address }));
    expect(
      forget.status,
      `POST /forget-password/email-otp -> ${forget.status}: ${forget.body}`,
    ).toBe(200);
    const otp = otpFor(address, "forget-password").otp;
    expect(otp, `expected a 6-digit reset otp, got ${otp}`).toMatch(/^\d{6}$/);

    const reset = await call(
      jsonRequest("/email-otp/reset-password", { email: address, otp, password: newPassword }),
    );
    expect(
      reset.status,
      `POST /email-otp/reset-password -> ${reset.status}: ${reset.body}`,
    ).toBe(200);

    const signInResult = await signIn(address, newPassword);
    expect(
      signInResult.status,
      `POST /sign-in/email with the new password -> ${signInResult.status}: ${signInResult.body}`,
    ).toBe(200);

    const request = await call(jsonRequest("/email-otp/request-password-reset", { email: address }));
    expect(
      request.status,
      `POST /email-otp/request-password-reset -> ${request.status}: ${request.body}`,
    ).toBe(200);

    const unknown = uniqueEmail();
    resetOutbox();
    const unknownForget = await call(
      jsonRequest("/forget-password/email-otp", { email: unknown }),
    );
    expect(
      unknownForget.status,
      `POST /forget-password/email-otp for an unknown address -> ${unknownForget.status}: ${unknownForget.body}`,
    ).toBe(200);
    expect(
      outbox.filter((entry) => entry.email === unknown).length,
      `expected no outbox entry for an unknown address, got ${JSON.stringify(outbox)}`,
    ).toBe(0);
  });

  skip("AC-10: change-password rejects a wrong current password and retains other sessions", async () => {
    const address = uniqueEmail();
    const newPassword = "robin-talks-changed-password-789";
    await signUpVerified(address);

    const first = await signIn(address, password);
    expect(first.status, `POST /sign-in/email -> ${first.status}: ${first.body}`).toBe(200);
    const firstCookie = cookieHeaderFrom(first.response);

    const second = await signIn(address, password);
    expect(second.status, `second POST /sign-in/email -> ${second.status}: ${second.body}`).toBe(
      200,
    );
    const secondCookie = cookieHeaderFrom(second.response);

    const wrong = await call(
      cookieRequest("/change-password", firstCookie, {
        currentPassword: "not-the-current-password",
        newPassword,
        revokeOtherSessions: false,
      }),
    );
    expect(
      wrong.status,
      `POST /change-password with a wrong current password -> ${wrong.status}: ${wrong.body}`,
    ).toBe(400);

    const changed = await call(
      cookieRequest("/change-password", firstCookie, {
        currentPassword: password,
        newPassword,
        revokeOtherSessions: false,
      }),
    );
    expect(
      changed.status,
      `POST /change-password -> ${changed.status}: ${changed.body}`,
    ).toBe(200);

    const retained = await call(
      new Request(`${authBase}/get-session`, { headers: { cookie: secondCookie } }),
    );
    expect(
      retained.status,
      `GET /get-session with the second session -> ${retained.status}: ${retained.body}`,
    ).toBe(200);
    const retainedBody = JSON.parse(retained.body) as { user?: { email: string } } | null;
    expect(
      retainedBody?.user?.email,
      `expected the second session to be retained, got ${retained.body}`,
    ).toBe(address);
  });

  skip("AC-11: delete-user removes the user and all session and account rows", async () => {
    const address = uniqueEmail();
    await signUpVerified(address);

    const signedIn = await signIn(address, password);
    expect(
      signedIn.status,
      `POST /sign-in/email -> ${signedIn.status}: ${signedIn.body}`,
    ).toBe(200);
    const cookie = cookieHeaderFrom(signedIn.response);

    const before = await getDb().select().from(user).where(eq(user.email, address));
    expect(before.length, `expected one user row before delete, got ${before.length}`).toBe(1);
    const userId = before[0].id;

    const deleted = await call(cookieRequest("/delete-user", cookie, { password }));
    expect(
      deleted.status,
      `POST /delete-user -> ${deleted.status}: ${deleted.body}`,
    ).toBe(200);

    const users = await getDb().select().from(user).where(eq(user.email, address));
    expect(users.length, `expected the user row to be gone, got ${users.length}`).toBe(0);
    const sessions = await getDb().select().from(session).where(eq(session.userId, userId));
    expect(
      sessions.length,
      `expected no session rows for ${userId}, got ${sessions.length}`,
    ).toBe(0);
    const accounts = await getDb().select().from(account).where(eq(account.userId, userId));
    expect(
      accounts.length,
      `expected no account rows for ${userId}, got ${accounts.length}`,
    ).toBe(0);
  });
});

describe("auth edge cases", () => {
  skip("Edge: duplicate sign-up returns 200 with token null and creates no second row", async () => {
    const address = uniqueEmail();

    resetOutbox();
    const first = await signUp(address);
    expect(first.status, `first POST /sign-up/email -> ${first.status}: ${first.body}`).toBe(200);

    const duplicate = await signUp(address);
    expect(
      duplicate.status,
      `duplicate POST /sign-up/email -> ${duplicate.status}: ${duplicate.body}`,
    ).toBe(200);
    const duplicateBody = JSON.parse(duplicate.body) as { token: string | null };
    expect(
      duplicateBody.token,
      `expected token null on a duplicate sign-up, got ${duplicate.body}`,
    ).toBeNull();

    const rows = await getDb().select().from(user).where(eq(user.email, address));
    expect(rows.length, `expected a single user row, got ${rows.length}`).toBe(1);
  });

  skip("Edge: verify-email rejects a wrong 6-digit otp", async () => {
    const address = uniqueEmail();

    resetOutbox();
    const signUpResult = await signUp(address);
    expect(
      signUpResult.status,
      `POST /sign-up/email -> ${signUpResult.status}: ${signUpResult.body}`,
    ).toBe(200);

    const realOtp = otpFor(address, "email-verification").otp;
    const wrongOtp = realOtp === "000000" ? "000001" : "000000";
    const verify = await call(
      jsonRequest("/email-otp/verify-email", { email: address, otp: wrongOtp }),
    );
    expect(
      verify.status,
      `POST /email-otp/verify-email with a wrong otp -> ${verify.status}: ${verify.body}`,
    ).toBe(400);
  });

  skip("Edge: sign-up rejects a password shorter than 8 characters", async () => {
    const address = uniqueEmail();

    const result = await signUp(address, "1234567");
    expect(
      result.status,
      `POST /sign-up/email with a 7-character password -> ${result.status}: ${result.body}`,
    ).toBe(400);
    const body = JSON.parse(result.body) as { code?: string };
    expect(body.code, `expected PASSWORD_TOO_SHORT, got ${result.body}`).toBe("PASSWORD_TOO_SHORT");
  });
});
