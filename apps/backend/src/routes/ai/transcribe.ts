import { Hono } from "hono";
import { openRouterApiKey } from "../../lib/env.js";
import {
  AI_AUDIO_MODEL,
  AI_SAYS,
  AI_TIMEOUT_MS,
  MAX_AUDIO_BASE64,
  OPENROUTER_URL,
  RECORDING_TOO_LONG,
  jsonBody,
  messageOf,
  openRouterSays,
  openrouterFetchWithTimeout,
  type AiRouterDeps,
  type AiTranscribeResult,
  type Loose,
} from "../../lib/ai/index.js";

function transcribeFailure(error: string, status: number, detail: string | null = null): AiTranscribeResult {
  return { text: null, error, status, reason: null, detail };
}

/** The base64 behind a data: URL, or the string as it already stands. */
function base64Body(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  return comma === -1 ? data : data.slice(comma + 1);
}

export function createTranscribeRouter(deps: Pick<AiRouterDeps, "openrouterFetch"> = {}): Hono {
  const fetchOpenRouter = deps.openrouterFetch ?? openrouterFetchWithTimeout;

  /**
   * One request to OpenRouter's Speech-to-Text API. The endpoint takes only a
   * model and the audio bytes, so callers' `language` and `prompt` are dropped.
   */
  async function transcribeOnce(clip: { data: string; format: string }): Promise<AiTranscribeResult> {
    try {
      const res = await fetchOpenRouter(OPENROUTER_URL + "/audio/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + openRouterApiKey() },
        body: JSON.stringify({ model: AI_AUDIO_MODEL, input_audio: { data: base64Body(clip.data), format: clip.format || "m4a" } }),
      }, AI_TIMEOUT_MS);
      const json: Loose = await res.json().catch(() => null);
      if (!res.ok) {
        const said = messageOf(json);
        return transcribeFailure(openRouterSays(res.status, said), res.status, json ? JSON.stringify(json) : said);
      }
      const text = json && typeof json.text === "string" ? json.text.trim() : "";
      if (!text) return transcribeFailure(AI_SAYS.noSpeech, res.status, "The recording had no speech in it.");
      return { text, error: null, status: res.status, reason: null, detail: null };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return transcribeFailure(aborted ? AI_SAYS.slow : AI_SAYS.offline, 0, err instanceof Error ? err.message : null);
    }
  }

  const transcribeRouter = new Hono();
  transcribeRouter.post("/", async (c) => {
    try {
      if (!openRouterApiKey()) return c.json(transcribeFailure(AI_SAYS.failed, 0, "OPENROUTER_API_KEY is not set."));
      const body = await jsonBody(c);
      const audio = body.audio && typeof body.audio === "object" ? body.audio : {};
      const clip = {
        data: typeof audio.data === "string" ? audio.data : "",
        format: typeof audio.format === "string" ? audio.format : "",
      };
      const stripped = base64Body(clip.data);
      if (stripped.length > MAX_AUDIO_BASE64) return c.json(transcribeFailure(RECORDING_TOO_LONG, 0, "The recording exceeded the 3 MB audio cap."));
      if (!stripped.trim()) return c.json(transcribeFailure(AI_SAYS.noSpeech, 0, "The recording had no audio in it."));
      return c.json(await transcribeOnce(clip));
    } catch (err) {
      return c.json(transcribeFailure(AI_SAYS.failed, 0, err instanceof Error ? err.message : null));
    }
  });
  return transcribeRouter;
}
