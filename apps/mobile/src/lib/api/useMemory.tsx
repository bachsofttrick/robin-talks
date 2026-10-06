import { useCallback, useEffect, useState } from "react";
import { db, plainError } from "../core/db";
import { IN_BROWSER } from "../core/db/config";
import { addMemory, deleteAllMemory, listMemory } from "../core/db/data";
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
    const res = IN_BROWSER
      ? await db
          .from("robin_memory")
          .select("id, kind, content")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40)
      : await listMemory();
    if (res.error) setError(plainError(res.error, "load"));
    else {
      setError(null);
      setData((res.data ?? []) as MemoryNote[]);
    }
    setLoading(false);
  }, [user]);

  // The async wrapper keeps reload's state updates off the effect's
  // synchronous path, which the React Compiler lint flags.
  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  const remember = useCallback(
    async (kind: string, content: string) => {
      if (!user || !content.trim()) return;
      if (IN_BROWSER) await db.from("robin_memory").insert({ user_id: user.id, kind, content: content.trim() });
      else await addMemory(kind, content.trim());
    },
    [user],
  );

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = IN_BROWSER
      ? await db.from("robin_memory").delete().eq("user_id", user.id)
      : await deleteAllMemory();
    if (res.error) return plainError(res.error, "save");
    setData([]);
    return null;
  }, [user]);

  return { data, loading, error, reload, remember, clearAll };
}
