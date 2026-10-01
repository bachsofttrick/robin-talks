import type { Turn } from "./useSessions";

export interface PastSession {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  summary: string | null;
  transcript: Turn[];
  debrief: string | null;
}

export interface SessionReader {
  listRecent(userId: string, limit: number): Promise<PastSession[]>;
  getById(userId: string, id: string): Promise<PastSession | null>;
}

const SEARCH_SCAN = 25;
const SEARCH_HITS = 3;
const RECENT_MAX = 5;
const EXCERPT_CHARS = 160;
const TRANSCRIPT_CHARS = 1200;

const LOOKUP_FAILED = "Robin could not look that up just now.";

function oneLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 3).trimEnd() + "..." : flat;
}

function dateOf(startedAt: string): string {
  return startedAt ? startedAt.slice(0, 10) : "unknown date";
}

function speakerOf(role: string): string {
  return role === "robin" ? "Robin" : "Learner";
}

function excerptOf(session: PastSession, query: string): string {
  const q = query.toLowerCase();
  const hit =
    session.transcript.find((t) => t.text.toLowerCase().includes(q)) ??
    session.transcript.find((t) => t.role === "user") ??
    session.transcript[0];
  if (hit) return oneLine(speakerOf(hit.role) + ": " + hit.text, EXCERPT_CHARS);
  if (session.summary) return oneLine(session.summary, EXCERPT_CHARS);
  return "No transcript yet.";
}

function transcriptExcerpt(session: PastSession): string {
  if (!session.transcript.length) return "No transcript yet.";
  return oneLine(
    session.transcript.map((t) => speakerOf(t.role) + ": " + t.text).join("\n"),
    TRANSCRIPT_CHARS,
  );
}

function debriefSummary(session: PastSession): string {
  if (!session.debrief) return "No debrief yet.";
  try {
    const parsed: unknown = JSON.parse(session.debrief);
    if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).summary === "string") {
      return oneLine((parsed as Record<string, unknown>).summary as string, 300);
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return oneLine(session.debrief, 300);
}

function hitLine(session: PastSession, detail: string): string {
  return "- " + session.id + " | " + session.scenarioTitle + " | " + dateOf(session.startedAt) + "\n  " + detail;
}

function argsObject(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : null;
}

export async function runSessionTool(
  reader: SessionReader,
  userId: string,
  name: string,
  args: unknown,
): Promise<string | null> {
  if (name === "search_sessions") {
    const query = argsObject(args)?.query;
    if (typeof query !== "string" || !query.trim()) return LOOKUP_FAILED;
    const q = query.trim().toLowerCase();
    const sessions = await reader.listRecent(userId, SEARCH_SCAN);
    const hits = sessions
      .filter(
        (s) =>
          s.scenarioTitle.toLowerCase().includes(q) ||
          (s.summary ?? "").toLowerCase().includes(q) ||
          s.transcript.some((t) => t.text.toLowerCase().includes(q)),
      )
      .slice(0, SEARCH_HITS);
    if (!hits.length) return "No past sessions matched that search.";
    return hits.map((s) => hitLine(s, excerptOf(s, q))).join("\n");
  }
  if (name === "get_session") {
    const id = argsObject(args)?.id;
    if (typeof id !== "string" || !id.trim()) return LOOKUP_FAILED;
    const session = await reader.getById(userId, id.trim());
    if (!session) return null;
    return [
      session.id + " | " + session.scenarioTitle + " | " + dateOf(session.startedAt),
      "Summary: " + (session.summary ? oneLine(session.summary, 300) : "No summary yet."),
      "Transcript:\n" + transcriptExcerpt(session),
      "Debrief: " + debriefSummary(session),
    ].join("\n");
  }
  if (name === "list_recent_sessions") {
    let limit = RECENT_MAX;
    const raw = argsObject(args)?.limit;
    if (typeof raw === "number" && Number.isFinite(raw)) limit = Math.floor(raw);
    limit = Math.min(Math.max(limit, 1), RECENT_MAX);
    const sessions = await reader.listRecent(userId, limit);
    if (!sessions.length) return "No past sessions yet.";
    return sessions
      .slice(0, limit)
      .map((s) => hitLine(s, s.summary ? oneLine(s.summary, EXCERPT_CHARS) : "No summary yet."))
      .join("\n");
  }
  return LOOKUP_FAILED;
}
