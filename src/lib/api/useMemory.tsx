import { useCallback, useEffect, useState } from "react";
import { db, plainError } from "../core/db";
import { useAuth } from "../core/auth";

export interface MemoryNote {
  id: string;
  kind: string;
  content: string;
}

export function useMemory() {
  const { user } = useAuth();
  const [data, setData] = useState<MemoryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setData([]);
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
      setData((res.data ?? []) as MemoryNote[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remember = useCallback(
    async (kind: string, content: string) => {
      if (!user || !content.trim()) return;
      await db.from("robin_memory").insert({ user_id: user.id, kind, content: content.trim() });
    },
    [user],
  );

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = await db.from("robin_memory").delete().eq("user_id", user.id);
    if (res.error) return plainError(res.error, "save");
    setData([]);
    return null;
  }, [user]);

  return { data, loading, error, reload, remember, clearAll };
}
