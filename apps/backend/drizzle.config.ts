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

function databaseUrl(): string {
  const { PGUSER, PGPASSWORD, PGDATABASE, PGHOST } = process.env;
  const host = PGHOST ? stripPooler(PGHOST) : undefined;
  if (!PGUSER || !PGPASSWORD || !host || !PGDATABASE) {
    throw new Error("PGUSER, PGPASSWORD, PGHOST, and PGDATABASE must be set");
  }

  return `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${host}:5432/${PGDATABASE}?sslmode=require`;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl() },
});
