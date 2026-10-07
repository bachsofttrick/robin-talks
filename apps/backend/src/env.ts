export type MailConfig = {
  provider?: string;
  apiKey?: string;
  from?: string;
};

const DEV_AUTH_SECRET = "robin-talks-dev-secret-not-for-production";

const DEV_BASE_URL = "http://localhost:3000";

function connectionString(user: string, password: string, host: string, database: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${database}?sslmode=require`;
}

export function databaseUrlOrNull(): string | null {
  const { PGUSER, PGPASSWORD, PGHOST, PGDATABASE } = process.env;
  if (PGUSER && PGPASSWORD && PGHOST && PGDATABASE) {
    return connectionString(PGUSER, PGPASSWORD, PGHOST, PGDATABASE);
  }

  return null;
}

export function requireDatabaseUrl(): string {
  const url = databaseUrlOrNull();
  if (url) return url;

  console.error(
    "Missing required database configuration: set PGHOST, PGUSER, PGPASSWORD, and PGDATABASE",
  );
  process.exit(1);
}

export function authSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV !== "production") return DEV_AUTH_SECRET;
  throw new Error("Missing required environment variable: BETTER_AUTH_SECRET");
}

export function baseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? DEV_BASE_URL;
}

export function port(): number {
  return Number(process.env.PORT ?? 3000);
}

export function trustedOrigins(): string[] {
  const origins = process.env.TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins && origins.length > 0) return origins;
  return [baseUrl()];
}

export function mailConfig(): MailConfig {
  const config: MailConfig = {};
  if (process.env.MAIL_PROVIDER) config.provider = process.env.MAIL_PROVIDER;
  if (process.env.MAIL_API_KEY) config.apiKey = process.env.MAIL_API_KEY;
  if (process.env.MAIL_FROM) config.from = process.env.MAIL_FROM;
  return config;
}
