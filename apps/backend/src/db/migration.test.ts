import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { unpooledDatabaseUrlOrNull } from "../env.js";

const databaseUrl = unpooledDatabaseUrlOrNull();
const noDb = databaseUrl === null;

if (noDb) {
  console.warn(
    "migration.test.ts: skipping database migration checks, no DATABASE_URL_UNPOOLED or unpooled PG* variables configured",
  );
}

const client = new Client({ connectionString: databaseUrl ?? undefined });

beforeAll(async () => {
  if (!noDb) await client.connect();
});

afterAll(async () => {
  if (!noDb) await client.end();
});

async function rows<T>(text: string): Promise<T[]> {
  const result = await client.query(text);
  return result.rows as T[];
}

type TableRow = { table_name: string };
type UniqueRow = { table_name: string; column_name: string };
type ForeignKeyRow = {
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  delete_rule: string;
};

const skip = test.skipIf(noDb);

describe("committed drizzle migration", () => {
  skip("creates the four better-auth tables in the public schema", async () => {
    const found = await rows<TableRow>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = found.map((row) => row.table_name);
    for (const table of ["user", "session", "account", "verification"]) {
      expect(names).toContain(table);
    }
  });

  skip("enforces unique constraints on user.email and session.token", async () => {
    const found = await rows<UniqueRow>(
      `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.constraint_schema = tc.constraint_schema
       WHERE tc.constraint_type = 'UNIQUE'
         AND tc.table_schema = 'public'
         AND ((tc.table_name = 'user' AND kcu.column_name = 'email')
           OR (tc.table_name = 'session' AND kcu.column_name = 'token'))`,
    );
    const pairs = found.map((row) => `${row.table_name}.${row.column_name}`);
    expect(pairs).toContain("user.email");
    expect(pairs).toContain("session.token");
  });

  skip("cascades session.userId and account.userId to user.id", async () => {
    const found = await rows<ForeignKeyRow>(
      `SELECT tc.table_name AS child_table,
              kcu.column_name AS child_column,
              ccu.table_name AS parent_table,
              ccu.column_name AS parent_column,
              rc.delete_rule AS delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.constraint_schema = tc.constraint_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.constraint_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
         AND tc.table_name IN ('session', 'account')
         AND kcu.column_name = 'userId'`,
    );
    for (const child of ["session", "account"]) {
      const key = found.find((row) => row.child_table === child);
      expect(key).toBeDefined();
      expect(key?.child_column).toBe("userId");
      expect(key?.parent_table).toBe("user");
      expect(key?.parent_column).toBe("id");
      expect(key?.delete_rule.toUpperCase()).toBe("CASCADE");
    }
  });
});
