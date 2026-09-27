import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, type } from "./theme";

// Written by Borel when this app was first built, from its direction, and an
// ordinary file in it now. The row a failed save or load is reported in, ABOVE
// the content rather than instead of it: what the person made stays on screen,
// the sentence says what did not happen, and the button tries again. The
// technical reason, when there is one, waits behind a "Details" tap. Its
// shape, colours and type come from ui/theme.ts.
export interface NoticeProps {
  /** One plain sentence, shown as it is: a store's status `error`. */
  message: string;
  /** The technical reason, shown only after a "Details" tap: a store's status `detail`. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  color?: string;
  backgroundColor?: string;
}

export function Notice({ message, detail, onRetry, retryLabel = "Try again", color = colors.text, backgroundColor = colors.surface }: NoticeProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.row, { backgroundColor }]} accessibilityRole="alert">
      <View style={styles.body}>
        <Text style={[styles.message, { color }]}>{message}</Text>
        {open && detail ? (
          <Text style={[styles.detail, { color }]} selectable>
            {detail}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Pressable onPress={() => setOpen((was) => !was)} hitSlop={8} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={[styles.detailsLabel, { color }]}>{open ? "Hide" : "Details"}</Text>
        </Pressable>
      ) : null}
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default Notice;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm + 4,
  },
  body: { flex: 1 },
  message: { ...type.secondary },
  detail: { ...type.caption, marginTop: spacing.xs },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.6 },
  detailsLabel: { ...type.secondary },
  retryLabel: { ...type.secondary, fontFamily: fonts.bodyBold, color: "#2F6F5E" },
});
