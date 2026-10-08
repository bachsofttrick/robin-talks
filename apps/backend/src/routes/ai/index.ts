import { Hono } from "hono";
import { auth } from "../../lib/auth.js";
import { chatRouter } from "./chat.js";
import { editRouter } from "./edits.js";
import { generationRouter } from "./generations.js";
import { transcribeRouter } from "./transcribe.js";
import type { AiSession } from "../../lib/ai/index.js";

export const aiRouter = new Hono();

aiRouter.use("*", async (c, next) => {
  let session: AiSession | null;
  try {
    const found = await auth.api.getSession({ headers: c.req.raw.headers });
    session = found ? { user: { id: found.user.id } } : null;
  } catch {
    // A session lookup that cannot run leaves the caller signed out.
    session = null;
  }
  if (!session) return c.json({ error: "You need to sign in first." }, 401);
  await next();
});

aiRouter.route("/chat", chatRouter);
aiRouter.route("/transcribe", transcribeRouter);
aiRouter.route("/images/generations", generationRouter);
aiRouter.route("/images/edits", editRouter);
