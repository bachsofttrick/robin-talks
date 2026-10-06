import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth.js";
import { getDb, learnerProfiles, practiceSessions, profiles, robinMemory } from "../db/index.js";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

const sessionColumns = {
  id: practiceSessions.id,
  scenario_id: practiceSessions.scenarioId,
  transcript: practiceSessions.transcript,
  debrief: practiceSessions.debrief,
  summary: practiceSessions.summary,
  started_at: practiceSessions.startedAt,
  ended_at: practiceSessions.endedAt,
};

const profileColumns = {
  display_name: learnerProfiles.displayName,
  level: learnerProfiles.level,
};

const memoryColumns = {
  id: robinMemory.id,
  kind: robinMemory.kind,
  content: robinMemory.content,
};

const fullProfileColumns = {
  id: profiles.id,
  email: profiles.email,
  display_name: profiles.displayName,
  avatar_url: profiles.avatarUrl,
  updated_at: profiles.updatedAt,
};

export const dataRouter = new Hono();

dataRouter.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "You need to sign in first." }, 401);
  c.set("userId", session.user.id);
  await next();
});

dataRouter.get("/profile", async (c) => {
  const rows = await getDb()
    .select(profileColumns)
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, c.get("userId")))
    .limit(1);
  return c.json(rows[0] ?? null);
});

dataRouter.put("/profile", async (c) => {
  const body = await c.req.json<{ display_name?: string | null; level?: string | null }>();
  const values = { displayName: body.display_name ?? null, level: body.level ?? null };
  const rows = await getDb()
    .insert(learnerProfiles)
    .values({ userId: c.get("userId"), ...values })
    .onConflictDoUpdate({ target: learnerProfiles.userId, set: values })
    .returning(profileColumns);
  return c.json(rows[0]);
});

dataRouter.post("/sessions", async (c) => {
  const body = await c.req.json<{ scenario_id?: string | null }>();
  const rows = await getDb()
    .insert(practiceSessions)
    .values({ userId: c.get("userId"), scenarioId: body.scenario_id ?? null, transcript: [] })
    .returning({ id: practiceSessions.id });
  return c.json(rows[0]);
});

dataRouter.get("/sessions/open", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), isNull(practiceSessions.endedAt)))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(1);
  return c.json(rows[0] ?? null);
});

dataRouter.get("/sessions/recent", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), isNotNull(practiceSessions.endedAt)))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(5);
  return c.json(rows);
});

dataRouter.get("/sessions/:id", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), eq(practiceSessions.id, c.req.param("id"))))
    .limit(1);
  if (!rows[0]) return c.json({ error: "Session not found." }, 404);
  return c.json(rows[0]);
});

dataRouter.patch("/sessions/:id", async (c) => {
  const body = await c.req.json<{
    transcript?: unknown;
    debrief?: string | null;
    summary?: string | null;
    ended_at?: string | null;
  }>();
  const where = and(eq(practiceSessions.userId, c.get("userId")), eq(practiceSessions.id, c.req.param("id")));

  const patch: Record<string, unknown> = {};
  if (body.transcript !== undefined) patch.transcript = body.transcript;
  if (body.debrief !== undefined) patch.debrief = body.debrief;
  if (body.summary !== undefined) patch.summary = body.summary;
  if (body.ended_at !== undefined) patch.endedAt = body.ended_at === null ? null : new Date(body.ended_at);

  if (Object.keys(patch).length === 0) {
    const rows = await getDb().select(sessionColumns).from(practiceSessions).where(where).limit(1);
    if (!rows[0]) return c.json({ error: "Session not found." }, 404);
    return c.json(rows[0]);
  }

  const rows = await getDb().update(practiceSessions).set(patch).where(where).returning(sessionColumns);
  if (!rows[0]) return c.json({ error: "Session not found." }, 404);
  return c.json(rows[0]);
});

dataRouter.delete("/sessions", async (c) => {
  await getDb().delete(practiceSessions).where(eq(practiceSessions.userId, c.get("userId")));
  return c.json({ ok: true });
});

dataRouter.get("/memory", async (c) => {
  const rows = await getDb()
    .select(memoryColumns)
    .from(robinMemory)
    .where(eq(robinMemory.userId, c.get("userId")))
    .orderBy(desc(robinMemory.createdAt))
    .limit(40);
  return c.json(rows);
});

dataRouter.post("/memory", async (c) => {
  const body = await c.req.json<{ kind?: string | null; content?: string | null }>();
  const rows = await getDb()
    .insert(robinMemory)
    .values({ userId: c.get("userId"), kind: body.kind ?? null, content: body.content ?? null })
    .returning({ id: robinMemory.id });
  return c.json(rows[0]);
});

dataRouter.delete("/memory", async (c) => {
  await getDb().delete(robinMemory).where(eq(robinMemory.userId, c.get("userId")));
  return c.json({ ok: true });
});

dataRouter.put("/profiles", async (c) => {
  const body = await c.req.json<{
    email?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }>();
  const values = {
    email: body.email ?? null,
    displayName: body.display_name ?? null,
    avatarUrl: body.avatar_url ?? null,
    updatedAt: new Date(),
  };
  const rows = await getDb()
    .insert(profiles)
    .values({ id: c.get("userId"), ...values })
    .onConflictDoUpdate({ target: profiles.id, set: values })
    .returning(fullProfileColumns);
  return c.json(rows[0]);
});
