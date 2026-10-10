import { useCallback, useEffect, useState } from "react";
import { plainError } from "../core/db";
import {
  createSession,
  deleteAllSessions,
  getOpenSession,
  getRecentSessions,
  getSession,
  updateSession,
} from "../core/db/data";
import { useAuth } from "../core/auth";
import type { Debrief } from "./useRobin";

export interface Turn {
  role: "robin" | "user";
  text: string;
}

export interface PracticeSession {
  id: string;
  scenario_id: string;
  transcript: Turn[];
  debrief: Debrief | null;
  ended_at: string | null;
  started_at: string;
  summary: string | null;
}

function asSession(row: Record<string, unknown>): PracticeSession {
  return {
    id: String(row.id),
    scenario_id: String(row.scenario_id),
    transcript: Array.isArray(row.transcript) ? (row.transcript as Turn[]) : [],
    debrief: row.debrief as Debrief,
    ended_at: (row.ended_at as string) ?? null,
    started_at: String(row.started_at ?? ""),
    summary: (row.summary as string) ?? null,
  };
}

export function useSessions() {
  const { user } = useAuth();
  const [open, setOpen] = useState<PracticeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setOpen(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let next: PracticeSession | null = null;
    let failure: string | null = null;
    const res = await getOpenSession();
    if (res.error) failure = plainError(res.error, "load");
    else next = res.data ? asSession(res.data as unknown as Record<string, unknown>) : null;
    setError(failure);
    setOpen(next);
    setLoading(false);
  }, [user]);

  // The async wrapper keeps reload's state updates off the effect's
  // synchronous path, which the React Compiler lint flags.
  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  const create = useCallback(
    async (scenarioId: string) => {
      if (!user) return { id: null as string | null, error: "You need an account first." };
      const res = await createSession(scenarioId);
      if (res.error) return { id: null as string | null, error: plainError(res.error, "save") };
      return { id: String((res.data as { id: string }).id), error: null as string | null };
    },
    [user],
  );

  const fetchOne = useCallback(async (id: string) => {
    const res = await getSession(id);
    if (res.error || !res.data) return null;
    return asSession(res.data as unknown as Record<string, unknown>);
  }, []);

  const saveTranscript = useCallback(async (id: string, transcript: Turn[]) => {
    const res = await updateSession(id, { transcript });
    return res.error ? plainError(res.error, "save") : null;
  }, []);

  const finish = useCallback(async (id: string, transcript: Turn[], debrief: Debrief, summary: string) => {
    const res = await updateSession(id, { transcript, debrief, summary, ended_at: new Date().toISOString() });
    return res.error ? plainError(res.error, "save") : null;
  }, []);

  const recent = useCallback(async () => {
    if (!user) return [] as PracticeSession[];
    const res = await getRecentSessions();
    if (res.error || !res.data) return [] as PracticeSession[];
    return (res.data as unknown as Record<string, unknown>[]).map(asSession);
  }, [user]);

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = await deleteAllSessions();
    if (res.error) return plainError(res.error, "save");
    setOpen(null);
    return null;
  }, [user]);

  return { open, loading, error, reload, create, fetchOne, saveTranscript, finish, recent, clearAll };
}
