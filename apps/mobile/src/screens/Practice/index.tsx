import React, { useCallback, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Screen, Notice } from "../../lib/ui";
import { colors, fonts, radius, spacing, type } from "../../lib/ui/theme";
import { Paper } from "../../lib/ui/Texture";
import { Bird } from "../../lib/ui/Bird";
import { Button } from "../../lib/ui/Button";
import { SectionHeader } from "../../lib/ui/SectionHeader";
import { useEnter, useStagger } from "../../lib/ui/motion";
import { SCENARIOS, scenarioById, Scenario } from "../../lib/api/scenarios";
import { useProfile } from "../../lib/api/useProfile";
import { useSessions } from "../../lib/api/useSessions";
import { RequireAccount } from "../../lib/core/auth";

function Row({ scenario, index, onPress }: { scenario: Scenario; index: number; onPress: () => void }) {
  const enter = useStagger(index);
  return (
    <Animated.View style={enter}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {scenario.title}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {scenario.description}
          </Text>
          <Text style={styles.rowGoal} numberOfLines={1}>
            Goal: {scenario.goal}
          </Text>
        </View>
        <Text style={styles.tag}>{scenario.level}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Catalog() {
  const navigation = useNavigation<any>();
  const { data: profile } = useProfile();
  const { open, reload, create, error } = useSessions();
  const [starting, setStarting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const enter = useEnter();

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const suggested = useMemo(() => {
    const match = SCENARIOS.filter((s) => s.level === profile.level);
    return (match.length ? match : SCENARIOS)[0];
  }, [profile.level]);

  const start = async (scenarioId: string) => {
    setStarting(scenarioId);
    setProblem(null);
    const res = await create(scenarioId);
    setStarting(null);
    if (res.error || !res.id) {
      setProblem(res.error ?? "That scene could not be started.");
      return;
    }
    navigation.navigate("Session", { sessionId: res.id, scenarioId });
  };

  const openScenario = open ? scenarioById(open.scenario_id) : undefined;
  const rest = SCENARIOS.filter((s) => s.id !== suggested.id);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Paper />
      <Animated.View style={[styles.hero, enter]}>
        <View style={styles.eyebrowRow}>
          <Bird size={18} />
          <Text style={styles.eyebrow}>
            {profile.displayName ? "Today for " + profile.displayName : "Today"}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{suggested.title}</Text>
        <Text style={styles.heroLead}>Pick a scene and Robin will meet you there</Text>
        <Button
          label={starting === suggested.id ? "Opening" : "Start this scene"}
          onPress={() => start(suggested.id)}
          loading={starting === suggested.id}
          style={styles.heroButton}
        />
      </Animated.View>

      {problem ? <Notice message={problem} /> : null}
      {error ? <Notice message={error} onRetry={reload} /> : null}

      {open && openScenario ? (
        <Pressable
          onPress={() => navigation.navigate("Session", { sessionId: open.id, scenarioId: open.scenario_id })}
          style={({ pressed }) => [styles.resume, pressed && styles.pressed]}
        >
          <Bird size={20} />
          <View style={styles.rowText}>
            <Text style={styles.resumeTitle}>Unfinished: {openScenario.title}</Text>
            <Text style={styles.rowDetail}>Pick the scene back up where you stopped</Text>
          </View>
        </Pressable>
      ) : null}

      <SectionHeader title="All scenes" count={rest.length} />
      {rest.map((scenario, index) => (
        <Row key={scenario.id} scenario={scenario} index={index} onPress={() => start(scenario.id)} />
      ))}
    </Screen>
  );
}

export default function PracticeScreen() {
  return (
    <RequireAccount reason="to practise with Robin">
      <Catalog />
    </RequireAccount>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: spacing.xl },
  hero: { gap: spacing.sm, marginTop: spacing.lg },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  eyebrow: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.accent },
  heroTitle: { ...type.display, color: colors.text },
  heroLead: { ...type.body, color: colors.textSecondary },
  heroButton: { marginTop: spacing.md, alignSelf: "flex-start", minWidth: 200 },
  resume: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  resumeTitle: { ...type.body, fontFamily: fonts.heading, color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 72,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, fontFamily: fonts.heading, fontSize: type.body.fontSize + 2, color: colors.text },
  rowDetail: { ...type.secondary, color: colors.textMuted },
  rowGoal: { ...type.caption, fontFamily: fonts.body, color: colors.textSecondary },
  tag: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.accent2 },
});
