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

function createDevTransport(): OtpTransport {
  return {
    async send(payload) {
      console.log(`[mail] dev otp for ${payload.email}: ${payload.otp}`);
      outbox.push({ ...payload });
    },
  };
}

function createProviderTransport(config: MailConfig): OtpTransport {
  return {
    async send(payload) {
      const { provider, apiKey, from } = config;
      if (!provider || !apiKey || !from) {
        throw new Error("Mail provider is not fully configured: provider, apiKey and from are required");
      }

      const response = await fetch(`https://api.${provider}.com/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: payload.email,
          otp: payload.otp,
          type: payload.type,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mail provider rejected the request with status ${response.status}`);
      }
    },
  };
}

export function createOtpTransport(config: MailConfig): OtpTransport {
  if (!config.provider) return createDevTransport();
  return createProviderTransport(config);
}
