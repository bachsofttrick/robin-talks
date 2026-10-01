import React from "react";
import { DefaultTheme, NavigationContainer as RNNavigationContainer } from "@react-navigation/native";

// Written by Borel when this app was first built, from the app's own colours,
// and an ordinary file in it now. React Navigation 7 needs a theme built from
// its own (DarkTheme or DefaultTheme carry the `fonts` its components read
// without checking); this is that theme with the app's colours over it, so
// what the navigator paints behind and between screens matches the app.
const base = DefaultTheme;

export const navigationTheme = {
  ...base,
  colors: {
    ...base.colors,
    background: "#F7F5F0",
    card: "#FFFFFF",
    text: "#242320",
    border: "#E5E5E4",
    primary: "#2F6F5E",
    notification: "#2F6F5E",
  },
};

export function NavigationContainer({ children }: { children: React.ReactNode }) {
  return <RNNavigationContainer theme={navigationTheme}>{children}</RNNavigationContainer>;
}

export default NavigationContainer;
