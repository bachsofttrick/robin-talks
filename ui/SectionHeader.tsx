import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing, type } from "./theme";
import { useEnter } from "./motion";

export interface SectionHeaderProps {
  title: string;
  count?: number;
  delay?: number;
}

export function SectionHeader({ title, count, delay = 0 }: SectionHeaderProps) {
  const enter = useEnter(delay);
  return (
    <Animated.View style={[styles.header, enter]}>
      <View style={styles.lead}>
        <Text style={styles.title}>{title}</Text>
        {count != null ? <Text style={styles.count}>{count}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.section,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.text,
  },
  lead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  title: { ...type.title, fontFamily: fonts.heading, color: colors.text },
  count: { ...type.secondary, fontFamily: fonts.body, color: colors.textMuted },
});

export default SectionHeader;
