import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authSchema, user } from "./auth-schema.js";

export const learnerProfiles = pgTable("learner_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  level: text("level"),
});

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id"),
    transcript: jsonb("transcript").default(sql`'[]'::jsonb`),
    debrief: text("debrief"),
    summary: text("summary"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("practice_sessions_user_id_idx").on(table.userId)],
);

export const robinMemory = pgTable(
  "robin_memory",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("robin_memory_user_id_idx").on(table.userId)],
);

export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const schema = {
  ...authSchema,
  learnerProfiles,
  practiceSessions,
  robinMemory,
  profiles,
};
