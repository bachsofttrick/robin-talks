import { Hono } from "hono";
import { getDb, profiles } from "../db/index.js";

const fullProfileColumns = {
  id: profiles.id,
  email: profiles.email,
  display_name: profiles.displayName,
  avatar_url: profiles.avatarUrl,
  updated_at: profiles.updatedAt,
};

export const profilesRouter = new Hono();

profilesRouter.put("/profiles", async (c) => {
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
