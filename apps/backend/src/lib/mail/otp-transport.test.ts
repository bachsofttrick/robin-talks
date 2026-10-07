import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { createOtpTransport, outbox, resetOutbox, type OtpType } from "./otp-transport.js";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

type FetchCall = {
  input: FetchInput;
  init: FetchInit;
};

const originalFetch = globalThis.fetch;

let calls: FetchCall[];
let logSpy: ReturnType<typeof spyOn>;

function stubFetch(response: Response): void {
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    calls.push({ input: args[0], init: args[1] });
    return response;
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  resetOutbox();
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetOutbox();
  logSpy.mockRestore();
});

const OTP_TYPES: OtpType[] = [
  "sign-in",
  "email-verification",
  "forget-password",
  "change-email",
];

describe("createOtpTransport dev transport", () => {
  test("selects the dev transport when provider is unset and pushes to the outbox", async () => {
    const transport = createOtpTransport({});

    await transport.send({ email: "a@b.c", otp: "123456", type: "sign-in" });

    expect(outbox).toEqual([{ email: "a@b.c", otp: "123456", type: "sign-in" }]);
  });

  test("resetOutbox clears the outbox", async () => {
    const transport = createOtpTransport({});
    await transport.send({ email: "a@b.c", otp: "123456", type: "sign-in" });

    resetOutbox();

    expect(outbox).toEqual([]);
  });

  test("hands the payload through unchanged for every type", async () => {
    const transport = createOtpTransport({});

    for (const type of OTP_TYPES) {
      await transport.send({ email: "user@example.com", otp: "000000", type });
    }

    expect(outbox.map((payload) => payload.type)).toEqual(OTP_TYPES);
    expect(
      outbox.every(
        (payload) => payload.email === "user@example.com" && payload.otp === "000000",
      ),
    ).toBe(true);
  });
});

describe("createOtpTransport provider transport", () => {
  test("selects the provider transport and posts the otp with authorization", async () => {
    stubFetch(new Response("", { status: 200 }));
    const transport = createOtpTransport({ provider: "resend", apiKey: "k", from: "a@b.c" });

    await transport.send({ email: "user@example.com", otp: "654321", type: "sign-in" });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(String(call.input)).toContain("resend");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ otp: "654321" });
    expect(outbox).toEqual([]);
  });

  test("defers incomplete configuration to send and names the missing config", async () => {
    stubFetch(new Response("", { status: 200 }));

    const transport = createOtpTransport({ provider: "resend" });
    expect(transport).toBeDefined();
    expect(calls).toHaveLength(0);

    await expect(
      transport.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/not fully configured/);
  });

  test("rejects when the provider responds with a non-ok status", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    const transport = createOtpTransport({ provider: "resend", apiKey: "k", from: "a@b.c" });

    await expect(
      transport.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/status 500/);
  });
});
