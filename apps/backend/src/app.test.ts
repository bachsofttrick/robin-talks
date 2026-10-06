import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import { app } from "./app.js";

const AUTH_ROUTES: Array<{ method: "POST" | "GET"; path: string }> = [
  { method: "POST", path: "/api/auth/sign-up/email" },
  { method: "POST", path: "/api/auth/sign-in/email" },
  { method: "POST", path: "/api/auth/sign-out" },
  { method: "GET", path: "/api/auth/get-session" },
  { method: "POST", path: "/api/auth/email-otp/verify-email" },
  { method: "POST", path: "/api/auth/email-otp/send-verification-otp" },
  { method: "POST", path: "/api/auth/forget-password/email-otp" },
  { method: "POST", path: "/api/auth/email-otp/reset-password" },
  { method: "POST", path: "/api/auth/change-password" },
  { method: "POST", path: "/api/auth/email-otp/request-password-reset" },
];

const DATABASE_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "PGHOST",
  "PGHOST_UNPOOLED",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
];

describe("AC-1: health and auth probe", () => {
  test("GET /health returns 200 with { status: ok }", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /api/auth/ok returns 200 with { ok: true }", async () => {
    const response = await app.request("/api/auth/ok");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("AC-13: better-auth paths are routed", () => {
  for (const { method, path } of AUTH_ROUTES) {
    test(`${method} ${path} is routed and does not need a database`, async () => {
      const response = await app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(
        response.status,
        `${method} ${path} returned 404, the path is not mounted`,
      ).not.toBe(404);
      expect(
        response.status,
        `${method} ${path} returned ${response.status}; check whether it reached the database`,
      ).toBeLessThan(500);
    });
  }
});

describe("AC-13: origin rejection", () => {
  test("POST /api/auth/sign-in/email rejects an untrusted origin when a cookie is present", async () => {
    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        cookie: "probe=1",
      },
      body: JSON.stringify({ email: "learner@example.com", password: "password-123" }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string; message?: string };
    expect(body.code).toBe("INVALID_ORIGIN");
    expect(body.message?.toLowerCase()).toContain("invalid origin");
  });
});

describe("AC-4: missing database configuration", () => {
  test("starting the server without DATABASE_URL exits non-zero naming the variable", () => {
    const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: "test" };
    for (const key of DATABASE_ENV_KEYS) delete env[key];

    const result = Bun.spawnSync({
      cmd: ["bun", "--no-env-file", "/app/apps/backend/src/index.ts"],
      cwd: tmpdir(),
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).not.toBe(0);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr).toContain("DATABASE_URL");
  });
});