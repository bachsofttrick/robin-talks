import { Hono } from "hono";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, practiceSessions } from "../../lib/db/index.js";

const sessionColumns = {
  id: practiceSessions.id,
  scenario_id: practiceSessions.scenarioId,
  transcript: practiceSessions.transcript,
  debrief: practiceSessions.debrief,
  summary: practiceSessions.summary,
  started_at: practiceSessions.startedAt,
  ended_at: practiceSessions.endedAt,
};

export const sessionsRouter = new Hono();

sessionsRouter.post("/sessions", async (c) => {
  const body = await c.req.json<{ scenario_id?: string | null }>();
  const userId = c.get("userId");
  // Close any open session so each user has at most one continued session.
  await getDb()
    .update(practiceSessions)
    .set({ endedAt: sql`now()` })
    .where(and(eq(practiceSessions.userId, userId), isNull(practiceSessions.endedAt)));
  const rows = await getDb()
    .insert(practiceSessions)
    .values({ userId, scenarioId: body.scenario_id ?? null, transcript: [] })
    .returning({ id: practiceSessions.id });
  return c.json(rows[0]);
});

sessionsRouter.get("/sessions/open", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), isNull(practiceSessions.endedAt)))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(1);
  return c.json(rows[0] ?? null);
});

sessionsRouter.get("/sessions/recent", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), isNotNull(practiceSessions.endedAt)))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(5);
  return c.json(rows);
});

sessionsRouter.get("/sessions/:id", async (c) => {
  const rows = await getDb()
    .select(sessionColumns)
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, c.get("userId")), eq(practiceSessions.id, c.req.param("id"))))
    .limit(1);
  if (!rows[0]) return c.json({ error: "Session not found." }, 404);
  return c.json(rows[0]);
});

sessionsRouter.patch("/sessions/:id", async (c) => {
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

sessionsRouter.delete("/sessions", async (c) => {
  await getDb().delete(practiceSessions).where(eq(practiceSessions.userId, c.get("userId")));
  return c.json({ ok: true });
});
