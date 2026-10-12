import { afterAll, describe, expect, it } from "bun:test";
import { getDb } from "./client.js";
import * as barrel from "./index.js";
import { account, session, user, verification } from "./schema/index.js";

const ENV_KEYS = [
  "PGUSER",
  "PGPASSWORD",
  "PGHOST",
  "PGDATABASE",
] as const;

const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) saved[key] = process.env[key];

process.env.PGUSER = "user";
process.env.PGPASSWORD = "password";
process.env.PGHOST = "db.example.com";
process.env.PGDATABASE = "app";

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("getDb", () => {
  it("creates a lazy client without connecting when a database is configured", () => {
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

describe("getDb without database configuration", () => {
  it("exits non-zero naming the variables when PG* variables are absent", () => {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const key of ENV_KEYS) delete env[key];

    const script =
      "const { getDb } = await import('./client.js'); getDb(); process.exit(0);";
    const result = Bun.spawnSync({
      cmd: ["bun", "--no-env-file", "-e", script],
      cwd: new URL(".", import.meta.url).pathname,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain("PGHOST");
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
