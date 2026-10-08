import { Hono } from "hono";
import { borelAiUrl } from "../../lib/env.js";
import {
  AI_SAYS,
  borelFetchWithTimeout,
  imageProxy,
  jsonBody,
  type AiImageResult,
  type AiRouterDeps,
} from "../../lib/ai/index.js";

export function createGenerationRouter(deps: Pick<AiRouterDeps, "borelFetch"> = {}): Hono {
  const fetchBorel = deps.borelFetch ?? borelFetchWithTimeout;

  const generationRouter = new Hono();
  generationRouter.post("/", async (c) => {
    try {
      if (!borelAiUrl()) return c.json({ url: null, error: AI_SAYS.picture, status: 0, reason: null, reused: null } satisfies AiImageResult);
      const body = await jsonBody(c);
      return c.json(await imageProxy(fetchBorel, "/images/generations", { prompt: body.prompt, size: body.size }, AI_SAYS.picture, c.req.raw.headers));
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return c.json({ url: null, error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline, status: 0, reason: null, reused: null } satisfies AiImageResult);
    }
  });
  return generationRouter;
}
