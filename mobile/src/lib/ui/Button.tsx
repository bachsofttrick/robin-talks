import React from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, fonts, radius, spacing, type } from "./theme";
import { usePress } from "./motion";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "quiet";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = "primary", disabled, loading, style }: ButtonProps) {
  const press = usePress();
  const off = disabled || loading;
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={off}
        style={({ pressed }) => [
          styles.base,
          variant === "primary" && styles.primary,
          variant === "outline" && styles.outline,
          variant === "quiet" && styles.quiet,
          off && styles.off,
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === "primary" ? colors.surface : colors.accent} />
        ) : (
          <Text style={[styles.label, variant === "primary" ? styles.onAccent : styles.onPage]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.accent },
  outline: { borderWidth: 1, borderColor: colors.text, backgroundColor: "transparent" },
  quiet: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  label: { ...type.body, fontFamily: fonts.bodyMedium, letterSpacing: 0.2 },
  onAccent: { color: colors.surface },
  onPage: { color: colors.text },
});

export default Button;
