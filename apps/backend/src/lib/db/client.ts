import { drizzle } from "drizzle-orm/postgres-js";
import postgres from 'postgres';
import { databaseUrl } from "../env.js";
import { schema } from "./schema/index.js";

function createDb() {
  const client = postgres(databaseUrl());
  return drizzle(client, { schema });
}

let instance: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!instance) instance = createDb();
  return instance;
}

export type Db = ReturnType<typeof getDb>;
