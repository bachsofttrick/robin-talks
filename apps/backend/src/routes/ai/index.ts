import { Hono } from "hono";
import { auth } from "../../lib/auth.js";
import { createChatRouter } from "./chat.js";
import { createEditRouter } from "./edits.js";
import { createGenerationRouter } from "./generations.js";
import { createTranscribeRouter } from "./transcribe.js";
import type { AiRouterDeps, AiSession } from "../../lib/ai/index.js";

export type {
  AiRefusal,
  AiChatResult,
  AiTranscribeResult,
  AiImageResult,
  AiJsonSchema,
  AiSession,
  AiRouterDeps,
  ChatContentPart,
  ChatMessage,
  ChatSendSeam,
  FetchSeam,
} from "../../lib/ai/index.js";

export function createAiRouter(deps: AiRouterDeps = {}): Hono {
  const getSession = deps.getSession ?? (async (headers: Headers): Promise<AiSession | null> => {
    const session = await auth.api.getSession({ headers });
    return session ? { user: { id: session.user.id } } : null;
  });

  const router = new Hono();
  router.use("*", async (c, next) => {
    let session: AiSession | null;
    try {
      session = (await getSession(c.req.raw.headers)) ?? null;
    } catch {
      // A session lookup that cannot run leaves the caller signed out.
      session = null;
    }
    if (!session) return c.json({ error: "You need to sign in first." }, 401);
    await next();
  });
  router.route("/chat", createChatRouter(deps));
  router.route("/transcribe", createTranscribeRouter(deps));
  router.route("/images/generations", createGenerationRouter(deps));
  router.route("/images/edits", createEditRouter(deps));
  return router;
}
