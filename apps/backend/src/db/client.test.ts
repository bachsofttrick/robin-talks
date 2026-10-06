import { afterAll, describe, expect, it } from "bun:test";
import { getDb } from "./client.js";
import * as barrel from "./index.js";
import { account, session, user, verification } from "./schema.js";

const ENV_KEYS = [
  "DATABASE_URL",
  "PGUSER",
  "PGPASSWORD",
  "PGHOST",
  "PGDATABASE",
] as const;

const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) saved[key] = process.env[key];
for (const key of ENV_KEYS) delete process.env[key];

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("getDb", () => {
  it("does not throw or connect when no database is configured", () => {
    expect(() => getDb()).not.toThrow();
  });

  it("returns the memoized singleton on repeated calls", () => {
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
  });

  it("returns the same instance without awaiting a query", () => {
    expect(getDb() === getDb()).toBe(true);
  });
});

describe("db barrel", () => {
  it("re-exports getDb", () => {
    expect(barrel.getDb).toBe(getDb);
  });

  it("re-exports the four schema tables", () => {
    expect(barrel.user).toBe(user);
    expect(barrel.session).toBe(session);
    expect(barrel.account).toBe(account);
    expect(barrel.verification).toBe(verification);
  });
});
