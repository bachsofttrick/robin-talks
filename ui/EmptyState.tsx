import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, type } from "./theme";

// Written by Borel when this app was first built, from its direction, and an
// ordinary file in it now. The finished version of a screen with nothing in it
// yet, in this app's own language: set from the left edge like the home screen's hero, the icon
// in a circle well, the way this app's icons sit, and every size, radius, colour and face from
// ui/theme.ts. The icon, the words and the action are the screen's own.
export interface EmptyStateProps {
  title: string;
  message?: string;
  /** A lucide icon element, e.g. <Inbox size={28} color={colors.accent} />. */
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {icon ? <View style={styles.well}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default EmptyState;

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "flex-start", justifyContent: "center", paddingVertical: spacing.section, paddingHorizontal: spacing.lg, gap: spacing.sm },
  well: { width: 72, height: 72, borderRadius: radius.avatar, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  title: { ...type.title, color: colors.text, textAlign: "left" },
  message: { ...type.body, color: colors.textSecondary, textAlign: "left", maxWidth: 320 },
  button: {
    marginTop: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  pressed: { opacity: 0.85 },
  buttonLabel: { ...type.body, fontFamily: fonts.bodyBold, color: "#FFFFFF" },
});
