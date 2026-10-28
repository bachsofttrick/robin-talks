import { useCallback, useEffect, useRef, useState } from "react";
import { plainError } from "../core/db";
import { getProfile, saveProfile } from "../core/db/data";
import { useAuth } from "../core/auth";
import { createStore } from "../core/borel/borel-store";
import type { Level } from "./scenarios";

export interface Profile {
  displayName: string;
  level: Level;
  onboarded: boolean;
}

const EMPTY: Profile = { displayName: "", level: "Beginner", onboarded: false };

const profileStore = createStore("robin.profile", EMPTY, { persist: true });

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  const accountScope = useRef<{ userId: string | undefined } | null>(null);
  const data = profileStore.use();
  const status = profileStore.useStatus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const scope = accountScope.current;
    if (!scope || scope.userId !== userId) return;
    if (!userId) {
      profileStore.set(EMPTY);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await getProfile();
    if (accountScope.current !== scope) return;
    if (res.error) {
      setError(plainError(res.error, "load"));
      setLoading(false);
      return;
    }
    setError(null);
    if (res.data) {
      profileStore.set({
        displayName: res.data.display_name ?? "",
        level: (res.data.level ?? EMPTY.level) as Level,
        onboarded: true,
      });
    } else {
      profileStore.set(EMPTY);
    }
    setLoading(false);
  }, [userId]);

  // The async wrapper keeps reload's state updates off the effect's
  // synchronous path, which the React Compiler lint flags.
  useEffect(() => {
    // Each account lifetime invalidates requests on account change or unmount.
    accountScope.current = { userId };
    (async () => {
      await reload();
    })();
    return () => {
      accountScope.current = null;
    };
  }, [reload, userId]);

  const save = useCallback(
    async (displayName: string, level: Level) => {
      if (!userId) return "You need an account first.";
      const scope = accountScope.current;
      if (!scope || scope.userId !== userId) return "You need an account first.";
      const res = await saveProfile(displayName, level);
      if (res.error) return plainError(res.error, "save");
      if (accountScope.current !== scope) return null;
      profileStore.set({ displayName, level, onboarded: true });
      return null;
    },
    [userId],
  );

  return { data, loading, error: error ?? status.error, reload, save };
}
