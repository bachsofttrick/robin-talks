import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { app } from "../app.js";
import {
  getDb,
  learnerProfiles,
  practiceSessions,
  profiles,
  robinMemory,
  user,
} from "../db/index.js";
import { baseUrl, databaseUrlOrNull } from "../env.js";
import { outbox, resetOutbox, type OtpPayload, type OtpType } from "../mail/otp-transport.js";

const noDb = databaseUrlOrNull() === null;

if (noDb) {
  console.warn(
    "data/router.test.ts: skipping data API integration checks, no DATABASE_URL or PG* variables configured",
  );
}

const skip = test.skipIf(noDb);

const origin = baseUrl();
const authBase = `${origin}/api/auth`;
const dataBase = `${origin}/api/data`;
const password = "robin-talks-password-123";
const name = "Robin Data Test";

const createdEmails: string[] = [];

function uniqueEmail(): string {
  const address = `robin-data-${crypto.randomUUID()}@example.com`;
  createdEmails.push(address);
  return address;
}

type CallResult = {
  status: number;
  body: string;
  response: Response;
};

async function call(path: string, init?: RequestInit): Promise<CallResult> {
  const response = await app.request(path, init);
  const body = await response.text();
  return { status: response.status, body, response };
}

function jsonInit(method: string, cookie?: string, payload?: unknown): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json", origin };
  if (cookie) headers.cookie = cookie;
  return { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) };
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
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

async function signUpVerified(address: string): Promise<void> {
  resetOutbox();
  const signUp = await call(
    `${authBase}/sign-up/email`,
    jsonInit("POST", undefined, { email: address, password, name }),
  );
  expect(signUp.status, `POST /sign-up/email -> ${signUp.status}: ${signUp.body}`).toBe(200);

  const entry = otpFor(address, "email-verification");
  const verify = await call(
    `${authBase}/email-otp/verify-email`,
    jsonInit("POST", undefined, { email: address, otp: entry.otp }),
  );
  expect(
    verify.status,
    `POST /email-otp/verify-email -> ${verify.status}: ${verify.body}`,
  ).toBe(200);
}

type SignedInUser = {
  email: string;
  cookie: string;
  userId: string;
};

async function newSignedInUser(): Promise<SignedInUser> {
  const address = uniqueEmail();
  await signUpVerified(address);

  const signIn = await call(
    `${authBase}/sign-in/email`,
    jsonInit("POST", undefined, { email: address, password }),
  );
  expect(signIn.status, `POST /sign-in/email -> ${signIn.status}: ${signIn.body}`).toBe(200);

  const rows = await getDb().select().from(user).where(eq(user.email, address));
  expect(rows.length, `expected one user row for ${address}, got ${rows.length}`).toBe(1);

  return { email: address, cookie: cookieHeaderFrom(signIn.response), userId: rows[0].id };
}

async function dataGet(path: string, cookie?: string): Promise<CallResult> {
  return call(`${dataBase}${path}`, cookie ? { headers: { cookie } } : undefined);
}

async function dataJson(
  method: string,
  path: string,
  cookie: string,
  payload: unknown,
): Promise<CallResult> {
  return call(`${dataBase}${path}`, jsonInit(method, cookie, payload));
}

async function dataDelete(path: string, cookie: string): Promise<CallResult> {
  return call(`${dataBase}${path}`, { method: "DELETE", headers: { cookie } });
}

afterAll(async () => {
  if (noDb) return;
  for (const address of createdEmails) {
    await getDb().delete(user).where(eq(user.email, address));
  }
});

describe("AC-17: unauthenticated data requests are rejected", () => {
  skip("GET /api/data/profile without a cookie returns 401", async () => {
    const result = await dataGet("/profile");
    expect(result.status, `GET /profile -> ${result.status}: ${result.body}`).toBe(401);
  });

  skip("GET /api/data/profile with a bogus cookie returns 401", async () => {
    const result = await dataGet("/profile", "better-auth.session_token=bogus-token");
    expect(result.status, `GET /profile -> ${result.status}: ${result.body}`).toBe(401);
  });
});

describe("AC-17/AC-19: learner profile get and upsert", () => {
  skip("PUT then GET returns the saved snake_case fields and a second PUT updates in place", async () => {
    const { cookie, userId } = await newSignedInUser();

    const firstPut = await dataJson("PUT", "/profile", cookie, {
      display_name: "Robin Learner",
      level: "B1",
    });
    expect(firstPut.status, `PUT /profile -> ${firstPut.status}: ${firstPut.body}`).toBe(200);

    const firstGet = await dataGet("/profile", cookie);
    expect(firstGet.status, `GET /profile -> ${firstGet.status}: ${firstGet.body}`).toBe(200);
    expect(JSON.parse(firstGet.body)).toEqual({ display_name: "Robin Learner", level: "B1" });

    const secondPut = await dataJson("PUT", "/profile", cookie, {
      display_name: "Robin Updated",
      level: "B2",
    });
    expect(secondPut.status, `PUT /profile -> ${secondPut.status}: ${secondPut.body}`).toBe(200);

    const secondGet = await dataGet("/profile", cookie);
    expect(JSON.parse(secondGet.body)).toEqual({ display_name: "Robin Updated", level: "B2" });

    const rows = await getDb()
      .select()
      .from(learnerProfiles)
      .where(eq(learnerProfiles.userId, userId));
    expect(rows.length, `expected one learner_profiles row, got ${rows.length}`).toBe(1);
  });
});

describe("AC-17/AC-19: practice session lifecycle", () => {
  skip("create, finish, list, read by id, and delete-all work for the caller", async () => {
    const { cookie, userId } = await newSignedInUser();

    const created = await dataJson("POST", "/sessions", cookie, { scenario_id: "ordering-coffee" });
    expect(created.status, `POST /sessions -> ${created.status}: ${created.body}`).toBe(200);
    const { id } = JSON.parse(created.body) as { id: string };
    expect(typeof id, `expected a server generated id, got ${created.body}`).toBe("string");

    const open = await dataGet("/sessions/open", cookie);
    expect(open.status, `GET /sessions/open -> ${open.status}: ${open.body}`).toBe(200);
    expect(JSON.parse(open.body)).toMatchObject({
      id,
      scenario_id: "ordering-coffee",
      transcript: [],
    });

    const transcript = [{ role: "user", text: "One coffee please" }];
    const endedAt = new Date().toISOString();
    const patched = await dataJson("PATCH", `/sessions/${id}`, cookie, {
      transcript,
      debrief: "Nice work.",
      summary: "Ordered a coffee.",
      ended_at: endedAt,
    });
    expect(patched.status, `PATCH /sessions/:id -> ${patched.status}: ${patched.body}`).toBe(200);

    const openAfter = await dataGet("/sessions/open", cookie);
    expect(JSON.parse(openAfter.body), `expected no open session, got ${openAfter.body}`).toBeNull();

    const recent = await dataGet("/sessions/recent", cookie);
    const recentBody = JSON.parse(recent.body) as Array<{ id: string; summary: string | null }>;
    expect(recentBody.map((row) => row.id)).toContain(id);

    const byId = await dataGet(`/sessions/${id}`, cookie);
    expect(byId.status, `GET /sessions/:id -> ${byId.status}: ${byId.body}`).toBe(200);
    expect(JSON.parse(byId.body)).toMatchObject({
      id,
      transcript,
      debrief: "Nice work.",
      summary: "Ordered a coffee.",
    });

    const deleted = await dataDelete("/sessions", cookie);
    expect(deleted.status, `DELETE /sessions -> ${deleted.status}: ${deleted.body}`).toBe(200);

    const rows = await getDb()
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.userId, userId));
    expect(rows.length, `expected no practice_sessions rows, got ${rows.length}`).toBe(0);
  });
});

describe("AC-17/AC-19: memory notes", () => {
  skip("insert then list returns id, kind, and content, and delete-all empties it", async () => {
    const { cookie, userId } = await newSignedInUser();

    const created = await dataJson("POST", "/memory", cookie, {
      kind: "preference",
      content: "Likes oat milk",
    });
    expect(created.status, `POST /memory -> ${created.status}: ${created.body}`).toBe(200);
    const { id } = JSON.parse(created.body) as { id: string };

    const listed = await dataGet("/memory", cookie);
    expect(listed.status, `GET /memory -> ${listed.status}: ${listed.body}`).toBe(200);
    const rows = JSON.parse(listed.body) as Array<{
      id: string;
      kind: string | null;
      content: string | null;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, kind: "preference", content: "Likes oat milk" });

    const deleted = await dataDelete("/memory", cookie);
    expect(deleted.status, `DELETE /memory -> ${deleted.status}: ${deleted.body}`).toBe(200);

    const dbRows = await getDb().select().from(robinMemory).where(eq(robinMemory.userId, userId));
    expect(dbRows.length, `expected no robin_memory rows, got ${dbRows.length}`).toBe(0);
  });
});

describe("AC-17: full profile upsert", () => {
  skip("PUT /api/data/profiles creates the caller's profiles row", async () => {
    const { cookie, userId } = await newSignedInUser();

    const put = await dataJson("PUT", "/profiles", cookie, {
      email: "learner@example.com",
      display_name: "Robin Learner",
      avatar_url: "https://example.com/avatar.png",
    });
    expect(put.status, `PUT /profiles -> ${put.status}: ${put.body}`).toBe(200);

    const rows = await getDb().select().from(profiles).where(eq(profiles.id, userId));
    expect(rows.length, `expected one profiles row, got ${rows.length}`).toBe(1);
    expect(rows[0]).toMatchObject({
      email: "learner@example.com",
      displayName: "Robin Learner",
      avatarUrl: "https://example.com/avatar.png",
    });
  });
});

describe("AC-19: a second user cannot touch the first user's rows", () => {
  skip("guessed ids return 404 and delete-all leaves the owner's rows intact", async () => {
    const owner = await newSignedInUser();
    const intruder = await newSignedInUser();

    const created = await dataJson("POST", "/sessions", owner.cookie, {
      scenario_id: "job-interview",
    });
    const { id } = JSON.parse(created.body) as { id: string };
    const memory = await dataJson("POST", "/memory", owner.cookie, {
      kind: "note",
      content: "Owner note",
    });
    expect(memory.status, `POST /memory -> ${memory.status}: ${memory.body}`).toBe(200);

    const read = await dataGet(`/sessions/${id}`, intruder.cookie);
    expect(read.status, `GET /sessions/:id as another user -> ${read.status}: ${read.body}`).toBe(
      404,
    );

    const patch = await dataJson("PATCH", `/sessions/${id}`, intruder.cookie, {
      summary: "hijacked",
    });
    expect(patch.status, `PATCH /sessions/:id as another user -> ${patch.status}: ${patch.body}`).toBe(
      404,
    );

    const ownerRows = await getDb()
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, id));
    expect(ownerRows.length, `expected the owner's row to remain, got ${ownerRows.length}`).toBe(1);
    expect(ownerRows[0].summary, `expected the summary to be unchanged`).toBeNull();

    const clearSessions = await dataDelete("/sessions", intruder.cookie);
    expect(
      clearSessions.status,
      `DELETE /sessions as another user -> ${clearSessions.status}: ${clearSessions.body}`,
    ).toBe(200);
    const clearMemory = await dataDelete("/memory", intruder.cookie);
    expect(
      clearMemory.status,
      `DELETE /memory as another user -> ${clearMemory.status}: ${clearMemory.body}`,
    ).toBe(200);

    const stillThere = await dataGet(`/sessions/${id}`, owner.cookie);
    expect(stillThere.status, `GET /sessions/:id as the owner -> ${stillThere.status}`).toBe(200);

    const ownerMemory = await dataGet("/memory", owner.cookie);
    expect(JSON.parse(ownerMemory.body)).toHaveLength(1);
  });
});

describe("AC-19: deleting an account cascades the user's data rows", () => {
  skip("delete-user removes learner_profiles, practice_sessions, robin_memory, and profiles", async () => {
    const { email, cookie, userId } = await newSignedInUser();

    await dataJson("PUT", "/profile", cookie, { display_name: "Cascade", level: "A2" });
    await dataJson("POST", "/sessions", cookie, { scenario_id: "asking-directions" });
    await dataJson("POST", "/memory", cookie, { kind: "note", content: "Cascade note" });
    await dataJson("PUT", "/profiles", cookie, {
      email,
      display_name: "Cascade",
      avatar_url: null,
    });

    const deleted = await call(
      `${authBase}/delete-user`,
      jsonInit("POST", cookie, { password }),
    );
    expect(deleted.status, `POST /delete-user -> ${deleted.status}: ${deleted.body}`).toBe(200);

    const [profileRows, sessionRows, memoryRows, fullProfileRows] = await Promise.all([
      getDb().select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId)),
      getDb().select().from(practiceSessions).where(eq(practiceSessions.userId, userId)),
      getDb().select().from(robinMemory).where(eq(robinMemory.userId, userId)),
      getDb().select().from(profiles).where(eq(profiles.id, userId)),
    ]);

    expect(profileRows.length, `expected no learner_profiles rows, got ${profileRows.length}`).toBe(
      0,
    );
    expect(sessionRows.length, `expected no practice_sessions rows, got ${sessionRows.length}`).toBe(
      0,
    );
    expect(memoryRows.length, `expected no robin_memory rows, got ${memoryRows.length}`).toBe(0);
    expect(
      fullProfileRows.length,
      `expected no profiles rows, got ${fullProfileRows.length}`,
    ).toBe(0);
  });
});
