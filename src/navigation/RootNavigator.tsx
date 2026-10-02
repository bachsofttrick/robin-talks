import React from "react";
import { StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Headphones, Home, Settings as SettingsIcon } from "lucide-react-native";
import { colors, iconStroke } from "../lib/ui/theme";
import { Bird, useTabBarOptions } from "../lib/ui";
import PracticeScreen from "../screens/Practice";
import SessionScreen from "../screens/Session";
import SettingsScreen from "../screens/Settings";
import OnboardingScreen from "../screens/Onboarding";
import { useProfile } from "../lib/api/useProfile";
import { useAuth } from "../lib/core/auth";

export type RootTabParamList = {
  Practice: undefined;
  Session: { sessionId: string; scenarioId: string } | undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Onboarding: undefined;
  Practice: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  const tabBar = useTabBarOptions({
    background: colors.surface,
    border: colors.border,
    active: colors.accent,
    inactive: colors.textMuted,
  });
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, ...tabBar }}>
      <Tab.Screen
        name="Practice"
        component={PracticeScreen}
        options={{ tabBarIcon: ({ color }) => <Home size={22} color={color} strokeWidth={iconStroke} /> }}
      />
      <Tab.Screen
        name="Session"
        component={SessionScreen}
        options={{ tabBarIcon: ({ color }) => <Headphones size={22} color={color} strokeWidth={iconStroke} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color }) => <SettingsIcon size={22} color={color} strokeWidth={iconStroke} /> }}
      />
    </Tab.Navigator>
  );
}

// The stored session and the learner profile are both read asynchronously, so
// neither `user` nor `onboarded` means anything yet during that gap. Rendering
// through it would flash the signed-out screen, then Onboarding, before the
// real destination. Hold on the splash until both answers have landed.
function Splash() {
  return (
    <View style={styles.splash}>
      <Bird size={72} />
    </View>
  );
}

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading: profileLoading } = useProfile();

  if (authLoading || (user && profileLoading)) return <Splash />;

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Practice" component={PracticeScreen} />
      </Stack.Navigator>
    );
  }
  const needsOnboarding = !data.onboarded;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {needsOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Tabs" component={Tabs} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
