import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, components, fonts, spacing, type } from "./theme";

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, style, ...rest }: FieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[styles.input, style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textSecondary },
  input: { ...components.input, ...type.body, fontFamily: fonts.body, color: colors.text },
  hint: { ...type.caption, fontFamily: fonts.body, color: colors.textMuted },
});

export default Field;
