import React from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import { Lora_700Bold } from "@expo-google-fonts/lora/700Bold";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { colors } from "./theme";

// Written by Borel from this app's theme, and rewritten if the theme's faces
// change: exactly the faces ui/theme.ts names, each by its own weight file.
// Every screen writes fontFamily: fonts.heading or fonts.body and gets the
// real face, on the phone and in the preview; nothing else in the app loads a
// font. The page colour is painted until the faces are in, so the first frame
// is never the system font flashing to the real one.
const FACES = { Lora_700Bold, Manrope_400Regular, Manrope_500Medium, Manrope_700Bold };

export function AppFonts({ children }: { children: React.ReactNode }) {
  const [loaded] = useFonts(FACES);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <>{children}</>;
}

export default AppFonts;
