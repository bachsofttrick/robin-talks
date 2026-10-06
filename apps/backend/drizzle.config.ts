import { defineConfig } from "drizzle-kit";

if (!process.env.PGUSER) {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional; drizzle-kit may supply credentials itself
  }
}

function stripPooler(host: string): string {
  return host.replace(/-pooler(?=\.|$)/, "");
}

function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;

  const { PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  const host = process.env.PGHOST_UNPOOLED ?? (process.env.PGHOST ? stripPooler(process.env.PGHOST) : undefined);
  if (!PGUSER || !PGPASSWORD || !host || !PGDATABASE) return undefined;

  return `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${host}:5432/${PGDATABASE}?sslmode=require`;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl() },
});
