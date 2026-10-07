import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, learnerProfiles } from "../db/index.js";

const profileColumns = {
  display_name: learnerProfiles.displayName,
  level: learnerProfiles.level,
};

export const profileRouter = new Hono();

profileRouter.get("/profile", async (c) => {
  const rows = await getDb()
    .select(profileColumns)
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, c.get("userId")))
    .limit(1);
  return c.json(rows[0] ?? null);
});

profileRouter.put("/profile", async (c) => {
  const body = await c.req.json<{ display_name?: string | null; level?: string | null }>();
  const values = { displayName: body.display_name ?? null, level: body.level ?? null };
  const rows = await getDb()
    .insert(learnerProfiles)
    .values({ userId: c.get("userId"), ...values })
    .onConflictDoUpdate({ target: learnerProfiles.userId, set: values })
    .returning(profileColumns);
  return c.json(rows[0]);
});
