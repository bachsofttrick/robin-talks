import { useCallback, useEffect, useState } from "react";
import { db, plainError } from "../core/db";
import { useAuth } from "../core/auth";
import { createAppStore } from "./store";

export interface MemoryNote {
  id: string;
  kind: string;
  content: string;
}

const memoryStore = createAppStore<MemoryNote[]>("robin.memory", []);
let prevUserId: string | null | undefined = undefined;

export function useMemory() {
  const { user } = useAuth();
  const data = memoryStore.use();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!user) {
      memoryStore.set([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await db
      .from("robin_memory")
      .select("id, kind, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (res.error) setError(plainError(res.error, "load"));
    else {
      setError(null);
      memoryStore.set((res.data ?? []) as MemoryNote[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (prevUserId !== userId) {
      prevUserId = userId;
      memoryStore.reset();
    }
    void Promise.resolve().then(() => reload());
  }, [userId, reload]);

  const remember = useCallback(
    async (kind: string, content: string) => {
      if (!user || !content.trim()) return;
      await db.from("robin_memory").insert({ user_id: user.id, kind, content: content.trim() });
      await reload();
    },
    [user, reload],
  );

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = await db.from("robin_memory").delete().eq("user_id", user.id);
    if (res.error) return plainError(res.error, "save");
    memoryStore.set([]);
    return null;
  }, [user]);

  return { data, loading, error, reload, remember, clearAll };
}
