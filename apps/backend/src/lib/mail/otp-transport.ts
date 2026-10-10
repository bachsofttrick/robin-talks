import { Resend } from "resend";

type MailConfig = {
  provider?: string;
  apiKey?: string;
  from?: string;
};

export type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export type OtpPayload = {
  email: string;
  otp: string;
  type: OtpType;
};

export type OtpTransport = {
  send(payload: OtpPayload): Promise<void>;
};

export const outbox: OtpPayload[] = [];

export function resetOutbox(): void {
  outbox.length = 0;
}

const subjects: Record<OtpType, string> = {
  "sign-in": "Your Robin Talks sign-in code",
  "email-verification": "Verify your Robin Talks email",
  "forget-password": "Reset your Robin Talks password",
  "change-email": "Confirm your new Robin Talks email",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderOtpEmail(payload: OtpPayload): { subject: string; text: string; html: string } {
  const subject = subjects[payload.type];
  const code = payload.otp;
  const text = `Your Robin Talks code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this email.`;
  const html = `<p>Your Robin Talks code is <strong>${escapeHtml(code)}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`;
  return { subject, text, html };
}

function createDevTransport(): OtpTransport {
  return {
    async send(payload) {
      console.log(`[mail] dev otp for ${payload.email}: ${payload.otp}`);
      outbox.push({ ...payload });
    },
  };
}

function createResendTransport(config: MailConfig): OtpTransport {
  return {
    async send(payload) {
      const { apiKey, from } = config;
      if (!apiKey || !from) {
        throw new Error("Mail provider is not fully configured: apiKey and from are required");
      }
      const resend = new Resend(apiKey);
      const { subject, text, html } = renderOtpEmail(payload);
      const { error } = await resend.emails.send({
        from,
        to: payload.email,
        subject,
        text,
        html,
      });
      if (error) {
        const e = error as { message?: string; error?: string; name?: string };
        const message = e.message ?? e.error ?? e.name;
        throw new Error(`Resend rejected the request: ${message}`);
      }
    },
  };
}

export function createOtpTransport(config: MailConfig): OtpTransport {
  if (!config.provider) return createDevTransport();
  if (config.provider === "resend") return createResendTransport(config);
  throw new Error(`Unsupported mail provider: ${config.provider}`);
}
