import React from "react";
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/api\/?$/, "");

export const LEGAL_LINKS = {
  privacy: BACKEND_URL ? `${BACKEND_URL}/legal/privacy-policy` : "",
  terms: BACKEND_URL ? `${BACKEND_URL}/legal/terms-of-service` : "",
};

export function openPrivacyPolicy(): void {
  if (LEGAL_LINKS.privacy) Linking.openURL(LEGAL_LINKS.privacy).catch(() => {});
}

export function openTermsOfUse(): void {
  if (LEGAL_LINKS.terms) Linking.openURL(LEGAL_LINKS.terms).catch(() => {});
}

export function LegalLinks({
  color = "#8E8E93",
  termsLabel = "Terms of Use",
  privacyLabel = "Privacy Policy",
  align = "center",
  style,
}: {
  color?: string;
  termsLabel?: string;
  privacyLabel?: string;
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, align === "left" ? styles.left : styles.center, style]}>
      <Pressable onPress={openTermsOfUse} accessibilityRole="link" hitSlop={8} style={styles.link}>
        <Text style={[styles.label, { color }]}>{termsLabel}</Text>
      </Pressable>
      <Text style={[styles.dot, { color }]}>·</Text>
      <Pressable onPress={openPrivacyPolicy} accessibilityRole="link" hitSlop={8} style={styles.link}>
        <Text style={[styles.label, { color }]}>{privacyLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingVertical: 16 },
  center: { justifyContent: "center" },
  left: { justifyContent: "flex-start" },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  label: { fontSize: 13, textDecorationLine: "underline" },
  dot: { fontSize: 13, marginHorizontal: 4 },
});
