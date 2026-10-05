import React, { useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Notice } from "../../lib/ui";
import { colors, fonts, radius, spacing, type } from "../../lib/ui/theme";
import { Bird } from "../../lib/ui/Bird";
import { Button } from "../../lib/ui/Button";
import { Field } from "../../lib/ui/Field";
import { SectionHeader } from "../../lib/ui/SectionHeader";
import { useEnter } from "../../lib/ui/motion";
import { useProfile } from "../../lib/api/useProfile";
import { useMemory } from "../../lib/api/useMemory";
import { useSessions } from "../../lib/api/useSessions";
import { AccountPanel, RequireAccount } from "../../lib/core/auth";
import { LegalLinks } from "../../lib/core/legal";
import type { Level } from "../../lib/api/scenarios";

const LEVELS: Level[] = ["Beginner", "Intermediate", "Advanced"];

function SettingsBody() {
  const { data, save } = useProfile();
  const memory = useMemory();
  const sessions = useSessions();
  const [name, setName] = useState(data.displayName);
  const [level, setLevel] = useState<Level>(data.level);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const enter = useEnter();

  const inSession = !!sessions.open;

  const saveProfile = async () => {
    if (!name.trim()) {
      setProblem("Robin needs a name to call you.");
      return;
    }
    setSaving(true);
    setProblem(null);
    const res = await save(name.trim(), level);
    setSaving(false);
    if (res) setProblem(res);
    else setMessage("Saved.");
  };

  const confirmClear = (what: "sessions" | "memory") => {
    const title = what === "sessions" ? "Delete all sessions" : "Delete all memory";
    const body =
      what === "sessions"
        ? "Every transcript and debrief is removed, and Robin can no longer look them up."
        : "Everything Robin remembers about you is removed.";
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = what === "sessions" ? await sessions.clearAll() : await memory.clearAll();
          if (res) setProblem(res);
          else setMessage(what === "sessions" ? "Sessions deleted." : "Memory deleted.");
        },
      },
    ]);
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Animated.View style={[styles.header, enter]}>
        <Bird size={22} />
        <Text style={styles.title}>Settings</Text>
      </Animated.View>

      <Field label="What Robin calls you" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" />

      <View style={styles.levels}>
        <Text style={styles.label}>Your level</Text>
        <View style={styles.levelRow}>
          {LEVELS.map((item) => {
            const active = item === level;
            return (
              <Pressable
                key={item}
                onPress={() => setLevel(item)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {problem ? <Notice message={problem} /> : null}
      {message ? <Text style={styles.saved}>{message}</Text> : null}
      <Button label="Save" onPress={saveProfile} loading={saving} />

      <SectionHeader title="Your data" />
      {memory.loading || sessions.loading ? (
        <ActivityIndicator color={colors.accent} style={styles.dataLoading} />
      ) : inSession ? (
        <Text style={styles.hint}>Finish the open scene before deleting anything.</Text>
      ) : (
        <>
          <Text style={styles.hint}>
            Robin keeps {memory.data.length} note{memory.data.length === 1 ? "" : "s"} about you. Your voice is never stored, only the text.
          </Text>
          <Button label="Delete all sessions" variant="quiet" onPress={() => confirmClear("sessions")} />
          <Button label="Delete all memory" variant="quiet" onPress={() => confirmClear("memory")} />
        </>
      )}

      <SectionHeader title="Account" />
      <AccountPanel />
      <LegalLinks color={colors.textMuted} />
    </Screen>
  );
}

export default function SettingsScreen() {
  return (
    <RequireAccount reason="to manage your practice">
      <SettingsBody />
    </RequireAccount>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.md, paddingBottom: spacing.xl },
  header: { gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  title: { ...type.display, color: colors.text },
  label: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textSecondary },
  levels: { gap: spacing.sm },
  levelRow: { flexDirection: "row", gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipLabel: { ...type.secondary, fontFamily: fonts.bodyMedium, color: colors.textSecondary },
  chipLabelActive: { color: colors.accent },
  pressed: { opacity: 0.8 },
  saved: { ...type.secondary, color: colors.accent },
  hint: { ...type.secondary, color: colors.textSecondary },
  dataLoading: { paddingVertical: spacing.lg },
});
