import { Hono } from "hono";
import { borelAiUrl } from "../../lib/env.js";
import { borelFetchWithTimeout } from "../../lib/ai/functions.js";
import {
  AI_SAYS,
  imageProxy,
  jsonBody,
  type AiImageResult,
} from "../../lib/ai/index.js";

export const generationRouter = new Hono();

generationRouter.post("/images/generations", async (c) => {
  try {
    if (!borelAiUrl()) return c.json({ url: null, error: AI_SAYS.picture, status: 0, reason: null, reused: null } satisfies AiImageResult);
    const body = await jsonBody(c);
    return c.json(await imageProxy(borelFetchWithTimeout, "/images/generations", { prompt: body.prompt, size: body.size }, AI_SAYS.picture, c.req.raw.headers));
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return c.json({ url: null, error: aborted ? AI_SAYS.pictureSlow : AI_SAYS.offline, status: 0, reason: null, reused: null } satisfies AiImageResult);
  }
});
