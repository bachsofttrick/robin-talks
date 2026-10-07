import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb, robinMemory } from "../lib/db/index.js";

const memoryColumns = {
  id: robinMemory.id,
  kind: robinMemory.kind,
  content: robinMemory.content,
};

export const memoryRouter = new Hono();

memoryRouter.get("/memory", async (c) => {
  const rows = await getDb()
    .select(memoryColumns)
    .from(robinMemory)
    .where(eq(robinMemory.userId, c.get("userId")))
    .orderBy(desc(robinMemory.createdAt))
    .limit(40);
  return c.json(rows);
});

memoryRouter.post("/memory", async (c) => {
  const body = await c.req.json<{ kind?: string | null; content?: string | null }>();
  const rows = await getDb()
    .insert(robinMemory)
    .values({ userId: c.get("userId"), kind: body.kind ?? null, content: body.content ?? null })
    .returning({ id: robinMemory.id });
  return c.json(rows[0]);
});

memoryRouter.delete("/memory", async (c) => {
  await getDb().delete(robinMemory).where(eq(robinMemory.userId, c.get("userId")));
  return c.json({ ok: true });
});
