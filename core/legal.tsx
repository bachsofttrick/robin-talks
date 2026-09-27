// Managed by Borel. This file is generated and kept in sync automatically.
// Editing it by hand will be overwritten. It holds the two links every app has
// to show (App Store Review Guidelines 5.1.1 and 3.1.2): render <LegalLinks />
// once, where people can always find it, and never type either URL anywhere.
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

// This app's own Privacy Policy, hosted and kept current by Borel, and Apple's
// standard Terms of Use (EULA), which governs any app without one of its own.
export const LEGAL_LINKS = {
  privacy: "https://api.borel.one/app/2e5ca675-84e4-4527-89dd-bedec5432801/privacy",
  terms: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
};

export function openPrivacyPolicy(): void {
  Linking.openURL(LEGAL_LINKS.privacy).catch(() => {});
}

export function openTermsOfUse(): void {
  Linking.openURL(LEGAL_LINKS.terms).catch(() => {});
}

export interface LegalLinksProps {
  /** Text colour. Pass the theme's muted text colour so the row belongs to the app. */
  color?: string;
  /** The two labels, in the app's own language. English by default. */
  termsLabel?: string;
  privacyLabel?: string;
  /** Centred under content by default; "left" for a settings list. */
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}

export function LegalLinks({
  color = "#8E8E93",
  termsLabel = "Terms of Use",
  privacyLabel = "Privacy Policy",
  align = "center",
  style,
}: LegalLinksProps) {
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
