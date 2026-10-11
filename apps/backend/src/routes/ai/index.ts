import { Hono } from "hono";
import { auth } from "../../lib/auth.js";
import { chatRouter } from "./chat.js";
import { editRouter } from "./edits.js";
import { generationRouter } from "./generations.js";
import { transcribeRouter } from "./transcribe.js";

export const aiRouter = new Hono();

aiRouter.use("*", async (c, next) => {
  let userId: string | null;
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    userId = session?.user.id ?? null;
  } catch {
    // A session lookup that cannot run leaves the caller signed out.
    userId = null;
  }
  if (!userId) return c.json({ error: "You need to sign in first." }, 401);
  c.set("userId", userId);
  await next();
});

aiRouter.route("/", chatRouter);
aiRouter.route("/", transcribeRouter);
aiRouter.route("/", generationRouter);
aiRouter.route("/", editRouter);
