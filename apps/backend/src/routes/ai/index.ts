import { Hono } from "hono";
import { auth } from "../../lib/auth.js";
import { chatRouter } from "./chat.js";
import { editRouter } from "./edits.js";
import { generationRouter } from "./generations.js";
import { transcribeRouter } from "./transcribe.js";

export const aiRouter = new Hono();

aiRouter.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "You need to sign in first." }, 401);
  c.set("userId", session.user.id);
  await next();
});

aiRouter.route("/", chatRouter);
aiRouter.route("/", transcribeRouter);
aiRouter.route("/", generationRouter);
aiRouter.route("/", editRouter);
