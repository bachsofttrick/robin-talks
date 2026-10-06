import { useCallback, useEffect, useState } from "react";
import { db, plainError } from "../core/db";
import { IN_BROWSER } from "../core/db/config";
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
  const data = profileStore.use();
  const status = profileStore.useStatus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      profileStore.set(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = IN_BROWSER
      ? await db
          .from("learner_profiles")
          .select("display_name, level")
          .eq("user_id", user.id)
          .maybeSingle()
      : await getProfile();
    if (res.error) {
      setError(plainError(res.error, "load"));
      setLoading(false);
      return;
    }
    setError(null);
    if (res.data) {
      profileStore.set({
        displayName: (res.data as { display_name: string }).display_name,
        level: (res.data as { level: Level }).level,
        onboarded: true,
      });
    } else {
      profileStore.set(EMPTY);
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

  const save = useCallback(
    async (displayName: string, level: Level) => {
      if (!user) return "You need an account first.";
      const res = IN_BROWSER
        ? await db
            .from("learner_profiles")
            .upsert({ user_id: user.id, display_name: displayName, level }, { onConflict: "user_id" })
        : await saveProfile(displayName, level);
      if (res.error) return plainError(res.error, "save");
      profileStore.set({ displayName, level, onboarded: true });
      return null;
    },
    [user],
  );

  return { data, loading, error: error ?? status.error, reload, save };
}
