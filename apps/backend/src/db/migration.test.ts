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

async function rows<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await client.query(text, params);
  return result.rows as T[];
}

type TableRow = { table_name: string };
type UniqueRow = { table_name: string; column_name: string };
type ColumnRow = { table_name: string; column_name: string; data_type: string };
type ColumnDefaultRow = { table_name: string; column_name: string; column_default: string | null };
type ForeignKeyRow = {
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  delete_rule: string;
};

const skip = test.skipIf(noDb);

const appTableColumns: Record<string, readonly string[]> = {
  learner_profiles: ["display_name", "level", "user_id"],
  practice_sessions: [
    "debrief",
    "ended_at",
    "id",
    "scenario_id",
    "started_at",
    "summary",
    "transcript",
    "user_id",
  ],
  robin_memory: ["content", "created_at", "id", "kind", "user_id"],
  profiles: ["avatar_url", "display_name", "email", "id", "updated_at"],
};

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

  skip("creates the four app tables in the public schema", async () => {
    const found = await rows<TableRow>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = found.map((row) => row.table_name);
    for (const table of Object.keys(appTableColumns)) {
      expect(names).toContain(table);
    }
  });

  skip("uses only the snake_case app columns from the spec", async () => {
    const found = await rows<ColumnRow>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [Object.keys(appTableColumns)],
    );
    const byTable = new Map<string, string[]>();
    for (const row of found) {
      const columns = byTable.get(row.table_name) ?? [];
      columns.push(row.column_name);
      byTable.set(row.table_name, columns);
    }
    for (const [table, expected] of Object.entries(appTableColumns)) {
      expect((byTable.get(table) ?? []).sort()).toEqual([...expected].sort());
    }
  });

  skip("cascades the app tables to user.id", async () => {
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
         AND tc.table_name IN ('learner_profiles', 'practice_sessions', 'profiles', 'robin_memory')`,
    );
    const expected = [
      { child_table: "learner_profiles", child_column: "user_id" },
      { child_table: "practice_sessions", child_column: "user_id" },
      { child_table: "profiles", child_column: "id" },
      { child_table: "robin_memory", child_column: "user_id" },
    ];
    for (const want of expected) {
      const key = found.find(
        (row) => row.child_table === want.child_table && row.child_column === want.child_column,
      );
      expect(key).toBeDefined();
      expect(key?.parent_table).toBe("user");
      expect(key?.parent_column).toBe("id");
      expect(key?.delete_rule.toUpperCase()).toBe("CASCADE");
    }
  });

  skip("defaults practice_sessions.id and robin_memory.id to gen_random_uuid", async () => {
    const found = await rows<ColumnDefaultRow>(
      `SELECT table_name, column_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (('practice_sessions', 'id'), ('robin_memory', 'id'))`,
    );
    for (const table of ["practice_sessions", "robin_memory"]) {
      const column = found.find((row) => row.table_name === table && row.column_name === "id");
      expect(column).toBeDefined();
      expect(column?.column_default ?? "").toContain("gen_random_uuid");
    }
  });

  skip("stores practice_sessions.transcript as jsonb", async () => {
    const found = await rows<ColumnRow>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'practice_sessions'
         AND column_name = 'transcript'`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.data_type).toBe("jsonb");
  });
});
