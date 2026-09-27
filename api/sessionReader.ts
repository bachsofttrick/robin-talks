import { db } from "../core/db";
import { scenarioById } from "./scenarios";
import type { PastSession, SessionReader } from "./robinTools";
import type { Turn } from "./useSessions";

const COLUMNS = "id, scenario_id, transcript, debrief, ended_at, started_at, summary";

function asPastSession(row: Record<string, unknown>): PastSession {
  const scenarioId = String(row.scenario_id ?? "");
  const transcript = Array.isArray(row.transcript) ? (row.transcript as Turn[]) : [];
  return {
    id: String(row.id),
    scenarioId,
    scenarioTitle: scenarioById(scenarioId)?.title ?? scenarioId,
    startedAt: String(row.started_at ?? ""),
    summary: typeof row.summary === "string" ? row.summary : null,
    transcript,
    debrief: typeof row.debrief === "string" ? row.debrief : null,
  };
}

async function listRecent(userId: string, limit: number): Promise<PastSession[]> {
  const res = await db
    .from("practice_sessions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (res.error || !res.data) return [];
  return (res.data as Record<string, unknown>[]).map(asPastSession);
}

async function getById(userId: string, id: string): Promise<PastSession | null> {
  const res = await db
    .from("practice_sessions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .not("ended_at", "is", null)
    .maybeSingle();
  if (res.error || !res.data) return null;
  return asPastSession(res.data as Record<string, unknown>);
}

export const sessionReader: SessionReader = { listRecent, getById };
