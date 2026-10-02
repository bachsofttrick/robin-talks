import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Headphones, Home, Settings as SettingsIcon } from "lucide-react-native";
import { colors, iconStroke } from "../lib/ui/theme";
import { useTabBarOptions } from "../lib/ui";
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

export default function RootNavigator() {
  const { user } = useAuth();
  const { data } = useProfile();
  const needsOnboarding = !!user && !data.onboarded;
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
