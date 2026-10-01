import { useCallback, useEffect, useState } from "react";
import { db, plainError } from "../core/db";
import { useAuth } from "../core/auth";
import { createAppStore } from "./store";

export interface Turn {
  role: "robin" | "user";
  text: string;
}

export interface PracticeSession {
  id: string;
  scenario_id: string;
  transcript: Turn[];
  debrief: string | null;
  ended_at: string | null;
  started_at: string;
  summary: string | null;
}

function asSession(row: Record<string, unknown>): PracticeSession {
  return {
    id: String(row.id),
    scenario_id: String(row.scenario_id),
    transcript: Array.isArray(row.transcript) ? (row.transcript as Turn[]) : [],
    debrief: (row.debrief as string) ?? null,
    ended_at: (row.ended_at as string) ?? null,
    started_at: String(row.started_at ?? ""),
    summary: (row.summary as string) ?? null,
  };
}

const openSessionStore = createAppStore<PracticeSession | null>("robin.openSession", null);
let prevUserId: string | null | undefined = undefined;

export function useSessions() {
  const { user } = useAuth();
  const open = openSessionStore.use();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!user) {
      openSessionStore.set(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await db
      .from("practice_sessions")
      .select("id, scenario_id, transcript, debrief, ended_at, started_at, summary")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);
    if (res.error) setError(plainError(res.error, "load"));
    else {
      setError(null);
      const rows = (res.data ?? []) as Record<string, unknown>[];
      openSessionStore.set(rows.length ? asSession(rows[0]) : null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (prevUserId !== userId) {
      prevUserId = userId;
      openSessionStore.reset();
    }
    void Promise.resolve().then(() => reload());
  }, [userId, reload]);

  const fetchOne = useCallback(async (id: string) => {
    const res = await db
      .from("practice_sessions")
      .select("id, scenario_id, transcript, debrief, ended_at, started_at, summary")
      .eq("id", id)
      .maybeSingle();
    if (res.error || !res.data) return null;
    return asSession(res.data as Record<string, unknown>);
  }, []);

  const create = useCallback(
    async (scenarioId: string) => {
      if (!user) return { id: null as string | null, error: "You need an account first." };
      const res = await db
        .from("practice_sessions")
        .insert({ user_id: user.id, scenario_id: scenarioId, transcript: [] })
        .select("id")
        .single();
      if (res.error) return { id: null as string | null, error: plainError(res.error, "save") };
      const id = String((res.data as { id: string }).id);
      const row = await fetchOne(id);
      if (row) openSessionStore.set(row);
      return { id, error: null as string | null };
    },
    [user, fetchOne],
  );

  const saveTranscript = useCallback(async (id: string, transcript: Turn[]) => {
    const res = await db.from("practice_sessions").update({ transcript }).eq("id", id);
    if (res.error) return plainError(res.error, "save");
    const current = openSessionStore.get();
    if (current && current.id === id) openSessionStore.set({ ...current, transcript });
    return null;
  }, []);

  const finish = useCallback(async (id: string, transcript: Turn[], debrief: string, summary: string) => {
    const res = await db
      .from("practice_sessions")
      .update({ transcript, debrief, summary, ended_at: new Date().toISOString() })
      .eq("id", id);
    if (res.error) return plainError(res.error, "save");
    openSessionStore.set(null);
    return null;
  }, []);

  const recent = useCallback(async () => {
    if (!user) return [] as PracticeSession[];
    const res = await db
      .from("practice_sessions")
      .select("id, scenario_id, transcript, debrief, ended_at, started_at, summary")
      .eq("user_id", user.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(5);
    if (res.error || !res.data) return [] as PracticeSession[];
    return (res.data as Record<string, unknown>[]).map(asSession);
  }, [user]);

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = await db.from("practice_sessions").delete().eq("user_id", user.id);
    if (res.error) return plainError(res.error, "save");
    openSessionStore.set(null);
    return null;
  }, [user]);

  return { open, loading, error, reload, create, fetchOne, saveTranscript, finish, recent, clearAll };
}
