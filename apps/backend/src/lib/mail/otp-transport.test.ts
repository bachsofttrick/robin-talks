import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import type { OtpType } from "./otp-transport.js";

type SendPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SendResult = { data: unknown; error: unknown };

const OTP_TYPES: OtpType[] = [
  "sign-in",
  "email-verification",
  "forget-password",
  "change-email",
];

const SECRET_KEY = "re_secret_test_key";

const constructorCalls: unknown[][] = [];
const sendCalls: SendPayload[] = [];
let nextResult: SendResult = { data: { id: "ok" }, error: null };

class FakeResend {
  constructor(...args: unknown[]) {
    constructorCalls.push(args);
  }

  emails = {
    send: async (payload: SendPayload) => {
      sendCalls.push(payload);
      return nextResult;
    },
  };
}

mock.module("resend", () => ({ Resend: FakeResend }));

const { createOtpTransport, renderOtpEmail, outbox, resetOutbox } = await import(
  "./otp-transport.js"
);

let consoleCalls: unknown[][];
let consoleSpies: ReturnType<typeof spyOn>[];

function spyOnConsole(): void {
  consoleCalls = [];
  const methods = ["log", "error", "warn", "info", "debug"] as const;
  consoleSpies = methods.map((method) =>
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    }),
  );
}

function consoleMentioned(value: string): boolean {
  return consoleCalls.some((args) =>
    args.some((arg) => typeof arg === "string" && arg.includes(value)),
  );
}

beforeEach(() => {
  constructorCalls.length = 0;
  sendCalls.length = 0;
  nextResult = { data: { id: "ok" }, error: null };
  resetOutbox();
  spyOnConsole();
});

afterEach(() => {
  resetOutbox();
  for (const spy of consoleSpies) spy.mockRestore();
});

describe("renderOtpEmail", () => {
  test("gives every type a distinct non-empty subject and puts the code in both bodies", () => {
    const rendered = OTP_TYPES.map((type) => renderOtpEmail({ email: "a@b.c", otp: "654321", type }));

    for (const { subject, text, html } of rendered) {
      expect(subject.length).toBeGreaterThan(0);
      expect(text).toContain("654321");
      expect(html).toContain("654321");
    }

    const subjects = rendered.map((email) => email.subject);
    expect(new Set(subjects).size).toBe(OTP_TYPES.length);
  });
});

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

describe("createOtpTransport provider selection", () => {
  test("selects the Resend transport for provider resend", async () => {
    const transport = createOtpTransport({ provider: "resend", apiKey: SECRET_KEY, from: "a@b.c" });

    await transport.send({ email: "user@example.com", otp: "654321", type: "sign-in" });

    expect(sendCalls).toHaveLength(1);
  });

  test.each(["sendgrid", "RESEND", " resend "])(
    "throws for unsupported provider %p",
    (provider) => {
      expect(() => createOtpTransport({ provider })).toThrow(/unsupported/i);
    },
  );
});

describe("Resend transport send", () => {
  test("sends once through the SDK with the config key as the sole constructor argument", async () => {
    const transport = createOtpTransport({ provider: "resend", apiKey: SECRET_KEY, from: "from@b.c" });

    await transport.send({ email: "user@example.com", otp: "654321", type: "sign-in" });

    expect(constructorCalls).toEqual([[SECRET_KEY]]);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toMatchObject({
      from: "from@b.c",
      to: "user@example.com",
      subject: renderOtpEmail({ email: "user@example.com", otp: "654321", type: "sign-in" }).subject,
    });
    expect(sendCalls[0].text).toContain("654321");
    expect(sendCalls[0].html).toContain("654321");
    expect(outbox).toEqual([]);
    expect(consoleMentioned(SECRET_KEY)).toBe(false);
  });

  test("rejects with the Resend error message when the send result carries one", async () => {
    nextResult = { data: null, error: { message: "domain not verified", name: "validation_error" } };
    const transport = createOtpTransport({ provider: "resend", apiKey: SECRET_KEY, from: "a@b.c" });

    await expect(
      transport.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/domain not verified/);
  });

  test("rejects with the nested error text when the send result has no message", async () => {
    nextResult = { data: null, error: { name: "application_error", error: "invalid api key" } };
    const transport = createOtpTransport({ provider: "resend", apiKey: SECRET_KEY, from: "a@b.c" });

    await expect(
      transport.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/invalid api key/);
  });

  test("rejects incomplete configuration before constructing a client or sending", async () => {
    const missingKey = createOtpTransport({ provider: "resend", from: "a@b.c" });
    const missingFrom = createOtpTransport({ provider: "resend", apiKey: SECRET_KEY });

    await expect(
      missingKey.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/not fully configured/);
    await expect(
      missingFrom.send({ email: "a@b.c", otp: "1", type: "sign-in" }),
    ).rejects.toThrow(/not fully configured/);

    expect(constructorCalls).toHaveLength(0);
    expect(sendCalls).toHaveLength(0);
  });
});
