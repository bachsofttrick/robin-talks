import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  authSecret,
  baseUrl,
  databaseUrlOrNull,
  mailConfig,
  port,
  trustedOrigins,
  unpooledDatabaseUrlOrNull,
} from "./env.js";

const ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "PGUSER",
  "PGPASSWORD",
  "PGHOST",
  "PGHOST_UNPOOLED",
  "PGDATABASE",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "TRUSTED_ORIGINS",
  "MAIL_PROVIDER",
  "MAIL_API_KEY",
  "MAIL_FROM",
  "PORT",
  "NODE_ENV",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("databaseUrlOrNull", () => {
  test("returns DATABASE_URL verbatim when set alongside PG variables", () => {
    process.env.DATABASE_URL = "postgresql://explicit@db.example.com:5432/app";
    process.env.PGUSER = "ignored";
    process.env.PGPASSWORD = "ignored";
    process.env.PGHOST = "ignored";
    process.env.PGDATABASE = "ignored";

    expect(databaseUrlOrNull()).toBe("postgresql://explicit@db.example.com:5432/app");
  });

  test("composes a connection string from PG variables with encoded credentials", () => {
    process.env.PGUSER = "user name";
    process.env.PGPASSWORD = "p@ss:word";
    process.env.PGHOST = "db.example.com";
    process.env.PGDATABASE = "app";

    expect(databaseUrlOrNull()).toBe(
      "postgresql://user%20name:p%40ss%3Aword@db.example.com:5432/app?sslmode=require",
    );
  });

  test("returns null when database variables are absent", () => {
    expect(databaseUrlOrNull()).toBeNull();
  });
});

describe("unpooledDatabaseUrlOrNull", () => {
  test("prefers DATABASE_URL_UNPOOLED", () => {
    process.env.DATABASE_URL_UNPOOLED = "postgresql://unpooled@db.example.com:5432/app";
    process.env.PGHOST_UNPOOLED = "ignored";
    process.env.PGHOST = "ignored";
    process.env.PGUSER = "ignored";
    process.env.PGPASSWORD = "ignored";
    process.env.PGDATABASE = "ignored";

    expect(unpooledDatabaseUrlOrNull()).toBe(
      "postgresql://unpooled@db.example.com:5432/app",
    );
  });

  test("falls back to PGHOST_UNPOOLED", () => {
    process.env.PGHOST_UNPOOLED = "unpooled.example.com";
    process.env.PGHOST = "pooled.example.com";
    process.env.PGUSER = "user";
    process.env.PGPASSWORD = "pass";
    process.env.PGDATABASE = "app";

    expect(unpooledDatabaseUrlOrNull()).toBe(
      "postgresql://user:pass@unpooled.example.com:5432/app?sslmode=require",
    );
  });

  test("strips the -pooler suffix from PGHOST", () => {
    process.env.PGHOST = "ep-cool-name-pooler.us-east-2.aws.neon.tech";
    process.env.PGUSER = "user";
    process.env.PGPASSWORD = "pass";
    process.env.PGDATABASE = "app";

    expect(unpooledDatabaseUrlOrNull()).toBe(
      "postgresql://user:pass@ep-cool-name.us-east-2.aws.neon.tech:5432/app?sslmode=require",
    );
  });

  test("returns null when no unpooled database configuration is present", () => {
    expect(unpooledDatabaseUrlOrNull()).toBeNull();
  });
});

describe("baseUrl", () => {
  test("defaults to http://localhost:3000", () => {
    expect(baseUrl()).toBe("http://localhost:3000");
  });

  test("honours BETTER_AUTH_URL", () => {
    process.env.BETTER_AUTH_URL = "https://api.example.com";
    expect(baseUrl()).toBe("https://api.example.com");
  });
});

describe("port", () => {
  test("defaults to 3000", () => {
    expect(port()).toBe(3000);
  });

  test("honours PORT", () => {
    process.env.PORT = "8080";
    expect(port()).toBe(8080);
  });
});

describe("trustedOrigins", () => {
  test("splits TRUSTED_ORIGINS on commas and trims whitespace", () => {
    process.env.TRUSTED_ORIGINS = "https://a.example.com, https://b.example.com ,https://c.example.com";
    expect(trustedOrigins()).toEqual([
      "https://a.example.com",
      "https://b.example.com",
      "https://c.example.com",
    ]);
  });

  test("falls back to [baseUrl()] when TRUSTED_ORIGINS is unset", () => {
    expect(trustedOrigins()).toEqual([baseUrl()]);
  });

  test("falls back to [baseUrl()] when TRUSTED_ORIGINS is blank", () => {
    process.env.TRUSTED_ORIGINS = " , ";
    expect(trustedOrigins()).toEqual([baseUrl()]);
  });
});

describe("authSecret", () => {
  test("returns BETTER_AUTH_SECRET when set", () => {
    process.env.BETTER_AUTH_SECRET = "real-secret";
    expect(authSecret()).toBe("real-secret");
  });

  test("returns the dev constant when NODE_ENV is not production", () => {
    process.env.NODE_ENV = "development";
    expect(authSecret()).toBe("robin-talks-dev-secret-not-for-production");
  });

  test("throws when NODE_ENV is production and the variable is unset", () => {
    process.env.NODE_ENV = "production";
    expect(() => authSecret()).toThrow("Missing required environment variable: BETTER_AUTH_SECRET");
  });
});

describe("mailConfig", () => {
  test("reads MAIL_* variables", () => {
    process.env.MAIL_PROVIDER = "resend";
    process.env.MAIL_API_KEY = "key-123";
    process.env.MAIL_FROM = "Robin <hi@example.com>";

    expect(mailConfig()).toEqual({
      provider: "resend",
      apiKey: "key-123",
      from: "Robin <hi@example.com>",
    });
  });

  test("returns an empty object and never throws when MAIL_* are absent", () => {
    expect(() => mailConfig()).not.toThrow();
    expect(mailConfig()).toEqual({});
  });
});
