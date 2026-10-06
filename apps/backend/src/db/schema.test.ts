import { describe, expect, it } from "bun:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account, schema, session, user, verification } from "./schema.js";

const tables = { user, session, account, verification };

const expectedColumns = {
  user: [
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "createdAt",
    "updatedAt",
  ],
  session: [
    "id",
    "expiresAt",
    "token",
    "createdAt",
    "updatedAt",
    "ipAddress",
    "userAgent",
    "userId",
  ],
  account: [
    "id",
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ],
  verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
} as const;

type TableKey = keyof typeof expectedColumns;

function indexedColumnNames(table: PgTable): string[] {
  return getTableConfig(table).indexes.flatMap((index) =>
    index.config.columns.map((column) =>
      "name" in column ? (column.name ?? "") : "",
    ),
  );
}

function foreignKeyOn(table: PgTable, columnName: string) {
  return getTableConfig(table).foreignKeys.find((foreignKey) =>
    foreignKey.reference().columns.some((column) => column.name === columnName),
  );
}

describe("drizzle schema", () => {
  it("uses better-auth physical table names, including quoted user", () => {
    for (const [key, table] of Object.entries(tables)) {
      expect(getTableName(table as PgTable)).toBe(key);
    }
    expect(getTableName(user)).toBe("user");
  });

  it("matches the better-auth camelCase column keys", () => {
    for (const key of Object.keys(expectedColumns) as TableKey[]) {
      expect(Object.keys(getTableColumns(tables[key]))).toEqual([
        ...expectedColumns[key],
      ]);
    }
  });

  it("matches the better-auth camelCase physical column names", () => {
    for (const key of Object.keys(expectedColumns) as TableKey[]) {
      const columns = getTableColumns(tables[key]);
      const names = Object.values(columns).map((column) => column.name);
      expect(names).toEqual([...expectedColumns[key]]);
    }
  });

  it("marks user.email and session.token unique", () => {
    expect(getTableColumns(user).email.isUnique).toBe(true);
    expect(getTableColumns(session).token.isUnique).toBe(true);
  });

  it("cascades session.userId and account.userId to user.id", () => {
    for (const table of [session, account]) {
      const foreignKey = foreignKeyOn(table, "userId");
      expect(foreignKey).toBeDefined();
      expect(foreignKey?.onDelete).toBe("cascade");

      const reference = foreignKey?.reference() as
        | { foreignColumns: { name: string }[]; foreignTable: PgTable }
        | undefined;
      expect(reference?.foreignColumns.map((column) => column.name)).toEqual(["id"]);
      expect(getTableName(reference?.foreignTable as PgTable)).toBe("user");
    }
  });

  it("indexes verification.identifier and both userId columns", () => {
    expect(indexedColumnNames(verification)).toContain("identifier");
    expect(indexedColumnNames(session)).toContain("userId");
    expect(indexedColumnNames(account)).toContain("userId");
  });

  it("exports the four tables on the schema object", () => {
    expect(Object.keys(schema)).toEqual([
      "user",
      "session",
      "account",
      "verification",
    ]);
  });
});
