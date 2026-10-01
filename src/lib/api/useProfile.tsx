import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, plainError } from "../core/db";
import { useAuth } from "../core/auth";
import { createAppStore } from "./store";
import { LEGACY_PROFILE_KEY, parseLegacyProfile } from "./profileImport";
import type { Level } from "./scenarios";

export interface Profile {
  displayName: string;
  level: Level;
  onboarded: boolean;
}

const EMPTY: Profile = { displayName: "", level: "Beginner", onboarded: false };

const profileStore = createAppStore<Profile>("robin.profile", EMPTY);
let prevUserId: string | null | undefined = undefined;

async function readLegacyProfile(): Promise<Profile | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(LEGACY_PROFILE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parseLegacyProfile(raw);
}

async function removeLegacyKey(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_PROFILE_KEY);
  } catch {
    // Best effort cleanup of the phone copy.
  }
}

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
    const res = await db
      .from("learner_profiles")
      .select("display_name, level")
      .eq("user_id", user.id)
      .maybeSingle();
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
      await removeLegacyKey();
    } else {
      const legacy = await readLegacyProfile();
      if (legacy) {
        const upsert = await db
          .from("learner_profiles")
          .upsert(
            { user_id: user.id, display_name: legacy.displayName, level: legacy.level },
            { onConflict: "user_id" },
          );
        if (upsert.error) {
          setError(plainError(upsert.error, "save"));
          profileStore.set(EMPTY);
          setLoading(false);
          return;
        }
        profileStore.set({ displayName: legacy.displayName, level: legacy.level, onboarded: true });
        await removeLegacyKey();
      } else {
        profileStore.set(EMPTY);
      }
    }
    setLoading(false);
  }, [user]);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (prevUserId !== userId) {
      prevUserId = userId;
      profileStore.reset();
    }
    void Promise.resolve().then(() => reload());
  }, [userId, reload]);

  const save = useCallback(
    async (displayName: string, level: Level) => {
      if (!user) return "You need an account first.";
      const res = await db
        .from("learner_profiles")
        .upsert({ user_id: user.id, display_name: displayName, level }, { onConflict: "user_id" });
      if (res.error) return plainError(res.error, "save");
      profileStore.set({ displayName, level, onboarded: true });
      return null;
    },
    [user],
  );

  return { data, loading, error: error ?? status.error, reload, save };
}
