import { Hono } from "hono";
import { auth } from "../../lib/auth.js";
import { memoryRouter } from "./memory.js";
import { profileRouter } from "./profile.js";
import { profilesRouter } from "./profiles.js";
import { sessionsRouter } from "./sessions.js";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export const dataRouter = new Hono();

dataRouter.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "You need to sign in first." }, 401);
  c.set("userId", session.user.id);
  await next();
});

dataRouter.route("/", profileRouter);
dataRouter.route("/", sessionsRouter);
dataRouter.route("/", memoryRouter);
dataRouter.route("/", profilesRouter);
