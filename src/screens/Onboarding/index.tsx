import React, { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, Notice } from "../../lib/ui";
import { colors, fonts, radius, spacing, type } from "../../lib/ui/theme";
import { Paper } from "../../lib/ui/Texture";
import { Bird } from "../../lib/ui/Bird";
import { Button } from "../../lib/ui/Button";
import { Field } from "../../lib/ui/Field";
import { useEnter } from "../../lib/ui/motion";
import { useProfile } from "../../lib/api/useProfile";
import type { Level } from "../../lib/api/scenarios";

const LEVELS: { level: Level; blurb: string }[] = [
  { level: "Beginner", blurb: "Short sentences, everyday words" },
  { level: "Intermediate", blurb: "Clear English at a normal pace" },
  { level: "Advanced", blurb: "Natural, idiomatic, full speed" },
];

export default function OnboardingScreen() {
  const { save } = useProfile();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enter = useEnter();

  const submit = async () => {
    if (!name.trim()) {
      setError("Please enter a name Robin can call you.");
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await save(name.trim(), level);
    setSaving(false);
    if (problem) setError(problem);
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Paper />
      <Animated.View style={[styles.hero, enter]}>
        <Bird size={28} />
        <Text style={styles.title}>Before Robin speaks</Text>
        <Text style={styles.lead}>
          Two things, so the scenes land at the right pace for you.
        </Text>
      </Animated.View>

      <Field
        label="What should Robin call you"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      <View style={styles.levels}>
        <Text style={styles.label}>Your English level</Text>
        {LEVELS.map((item) => {
          const active = item.level === level;
          return (
            <Pressable
              key={item.level}
              onPress={() => setLevel(item.level)}
              style={({ pressed }) => [styles.level, active && styles.levelActive, pressed && styles.pressed]}
            >
              <View style={styles.levelText}>
                <Text style={styles.levelName}>{item.level}</Text>
                <Text style={styles.levelBlurb}>{item.blurb}</Text>
              </View>
              {active ? <Bird size={20} /> : null}
            </Pressable>
          );
        })}
      </View>

      {error ? <Notice message={error} /> : null}
      <Button label={saving ? "Saving" : "Start practising"} onPress={submit} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.lg, paddingBottom: spacing.xl },
  hero: { gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  title: { ...type.display, color: colors.text },
  lead: { ...type.body, color: colors.textSecondary, maxWidth: 300 },
  levels: { gap: spacing.sm },
  label: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textSecondary },
  level: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.85 },
  levelText: { flex: 1, gap: 2 },
  levelName: { ...type.body, fontFamily: fonts.heading, color: colors.text },
  levelBlurb: { ...type.secondary, color: colors.textSecondary },
});
