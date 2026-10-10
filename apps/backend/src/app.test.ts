import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import { app, createApp } from "./app.js";

const AUTH_ROUTES: Array<{ method: "POST" | "GET"; path: string }> = [
  { method: "POST", path: "/api/auth/sign-up/email" },
  { method: "POST", path: "/api/auth/sign-in/email" },
  { method: "POST", path: "/api/auth/sign-out" },
  { method: "POST", path: "/api/auth/delete-user" },
  { method: "GET", path: "/api/auth/get-session" },
  { method: "POST", path: "/api/auth/email-otp/verify-email" },
  { method: "POST", path: "/api/auth/email-otp/send-verification-otp" },
  { method: "POST", path: "/api/auth/email-otp/request-password-reset" },
  { method: "POST", path: "/api/auth/email-otp/reset-password" },
  { method: "POST", path: "/api/auth/change-password" },
  { method: "POST", path: "/api/auth/email-otp/request-password-reset" },
];

const DATABASE_ENV_KEYS = [
  "PGHOST",
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
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const body = (await response.json()) as { code?: string; message?: string };
    expect(body.code).toBe("INVALID_ORIGIN");
    expect(body.message?.toLowerCase()).toContain("invalid origin");
  });
});

const PREVIEW_ORIGIN = "http://localhost:8081";

async function withTrustedOrigin(
  run: (scoped: ReturnType<typeof createApp>) => Promise<void>,
): Promise<void> {
  const previous = process.env.TRUSTED_ORIGINS;
  process.env.TRUSTED_ORIGINS = PREVIEW_ORIGIN;
  try {
    await run(createApp());
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_ORIGINS;
    else process.env.TRUSTED_ORIGINS = previous;
  }
}

function expectPreviewCors(response: Response): void {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(PREVIEW_ORIGIN);
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
}

describe("AC-26/AC-29: CORS headers for auth and data routes", () => {
  test("OPTIONS /api/auth/sign-in/email preflight allows the preview origin", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/auth/sign-in/email", {
        method: "OPTIONS",
        headers: { origin: PREVIEW_ORIGIN, "access-control-request-method": "POST" },
      });
      expect(response.status).toBe(204);
      expectPreviewCors(response);
    });
  });

  test("credentialed POST /api/auth/sign-in/email echoes the preview origin", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: PREVIEW_ORIGIN,
          cookie: "probe=1",
        },
        body: JSON.stringify({ email: "learner@example.com", password: "password-123" }),
      });
      expectPreviewCors(response);
    });
  });

  test("OPTIONS /api/data/profile preflight allows the preview origin", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/data/profile", {
        method: "OPTIONS",
        headers: { origin: PREVIEW_ORIGIN, "access-control-request-method": "GET" },
      });
      expect(response.status).toBe(204);
      expectPreviewCors(response);
    });
  });

  test("credentialed GET /api/data/profile reaches the handler and echoes the preview origin", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/data/profile", {
        method: "GET",
        headers: { origin: PREVIEW_ORIGIN, cookie: "probe=1" },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "You need to sign in first." });
      expectPreviewCors(response);
    });
  });
});

const AI_PATHS: Array<string> = [
  "/api/ai/chat",
  "/api/ai/transcribe",
  "/api/ai/images/generations",
  "/api/ai/images/edits",
];

describe("AC-1: /api/ai is mounted and gated by the session", () => {
  for (const path of AI_PATHS) {
    test(`POST ${path} without a session returns the 401 sign-in body`, async () => {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status, `${path} -> ${response.status}`).toBe(401);
      expect(await response.json()).toEqual({ error: "You need to sign in first." });
    });
  }
});

describe("AC-8: CORS headers for ai routes", () => {
  test("OPTIONS /api/ai/chat preflight allows the preview origin", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/ai/chat", {
        method: "OPTIONS",
        headers: { origin: PREVIEW_ORIGIN, "access-control-request-method": "POST" },
      });
      expect(response.status).toBe(204);
      expectPreviewCors(response);
    });
  });

  test("credentialed POST /api/ai/chat echoes the preview origin alongside the 401 body", async () => {
    await withTrustedOrigin(async (scoped) => {
      const response = await scoped.request("/api/ai/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: PREVIEW_ORIGIN,
          cookie: "probe=1",
        },
        body: "{}",
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "You need to sign in first." });
      expectPreviewCors(response);
    });
  });
});

const ORIGIN_PROBE_SCRIPT =
  "const { auth } = await import('./lib/auth.js');" +
  "const r = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email'," +
  "{ method: 'POST', headers: { 'content-type': 'application/json', origin: '" +
  PREVIEW_ORIGIN +
  "', cookie: 'probe=1' }, body: '{}' }));" +
  "console.log(r.status); process.exit(0);";

function runOriginProbe(env: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ["bun", "--no-env-file", "-e", ORIGIN_PROBE_SCRIPT],
    cwd: new URL(".", import.meta.url).pathname,
    env,
    stdout: "pipe",
  });
}

describe("AC-26: trusted origin acceptance in a spawned process", () => {
  test("the preview origin is accepted when trusted and rejected when not", () => {
    const trusted = runOriginProbe({
      ...process.env,
      NODE_ENV: "test",
      TRUSTED_ORIGINS: PREVIEW_ORIGIN,
    });
    expect(new TextDecoder().decode(trusted.stdout).trim()).not.toBe("403");

    const untrustedEnv: Record<string, string | undefined> = { ...process.env, NODE_ENV: "test" };
    delete untrustedEnv.TRUSTED_ORIGINS;
    const untrusted = runOriginProbe(untrustedEnv);
    expect(new TextDecoder().decode(untrusted.stdout).trim()).toBe("403");
  });
});

describe("AC-4: missing database configuration", () => {
  test("starting the server without database configuration exits non-zero naming the variables", () => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "test-secret",
    };
    for (const key of DATABASE_ENV_KEYS) delete env[key];

    const entry = new URL("./index.ts", import.meta.url).pathname;
    const result = Bun.spawnSync({
      cmd: ["bun", "--no-env-file", entry],
      cwd: tmpdir(),
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).not.toBe(0);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr).toContain("PGHOST");
  });
});