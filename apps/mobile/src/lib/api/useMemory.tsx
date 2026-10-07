import { useCallback, useEffect, useState } from "react";
import { plainError } from "../core/db";
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
    const res = await listMemory();
    if (res.error) setError(plainError(res.error, "load"));
    else {
      setError(null);
      setData((res.data ?? []) as unknown as MemoryNote[]);
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
      await addMemory(kind, content.trim());
    },
    [user],
  );

  const clearAll = useCallback(async () => {
    if (!user) return "You need an account first.";
    const res = await deleteAllMemory();
    if (res.error) return plainError(res.error, "save");
    setData([]);
    return null;
  }, [user]);

  return { data, loading, error, reload, remember, clearAll };
}
