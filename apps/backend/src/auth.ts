import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { getDb, schema } from "./db/index.js";
import { authSecret, baseUrl, mailConfig, trustedOrigins } from "./env.js";
import { createOtpTransport } from "./mail/otp-transport.js";

export const auth = betterAuth({
  database: (options: BetterAuthOptions) => drizzleAdapter(getDb(), { provider: "pg", schema })(options),
  baseURL: baseUrl(),
  secret: authSecret(),
  trustedOrigins: trustedOrigins(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: { sendOnSignIn: true },
  user: { deleteUser: { enabled: true } },
  advanced: {
    useSecureCookies: baseUrl().startsWith("https"),
    disableOriginCheck: false,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        await createOtpTransport(mailConfig()).send({ email, otp, type });
      },
    }),
  ],
});
