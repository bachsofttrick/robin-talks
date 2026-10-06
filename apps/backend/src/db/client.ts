import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrlOrNull } from "../env.js";
import { schema } from "./schema.js";

function createDb() {
  const pool = new Pool({ connectionString: databaseUrlOrNull() ?? undefined });
  return drizzle(pool, { schema });
}

let instance: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!instance) instance = createDb();
  return instance;
}

export type Db = ReturnType<typeof getDb>;
