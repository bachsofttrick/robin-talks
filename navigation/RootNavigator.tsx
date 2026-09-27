import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Headphones, Home, Settings as SettingsIcon } from "lucide-react-native";
import { colors, iconStroke, spacing } from "../ui/theme";
import { Notice, useTabBarOptions } from "../ui";
import PracticeScreen from "../screens/Practice";
import SessionScreen from "../screens/Session";
import SettingsScreen from "../screens/Settings";
import OnboardingScreen from "../screens/Onboarding";
import { useProfile } from "../api/useProfile";
import { useSessions } from "../api/useSessions";
import { useAuth } from "../core/auth";
import { rootRoute } from "./rootRoute";

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

function Tabs({ initialTab = "Practice" }: { initialTab?: "Practice" | "Session" }) {
  const tabBar = useTabBarOptions({
    background: colors.surface,
    border: colors.border,
    active: colors.accent,
    inactive: colors.textMuted,
  });
  return (
    <Tab.Navigator initialRouteName={initialTab} screenOptions={{ headerShown: false, ...tabBar }}>
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
  const { loading: authLoading, signedIn } = useAuth();
  const profile = useProfile();
  const sessions = useSessions();
  // The reads gate Tabs so initialRouteName is decided on real data at mount.
  // The open-session query already filters with .is("ended_at", null), so an
  // ended session never resumes here.
  const route = rootRoute({
    authLoading,
    signedIn,
    profileLoading: profile.loading,
    profileError: profile.error,
    profileDetail: null,
    onboarded: profile.data.onboarded,
    sessionLoading: sessions.loading,
    hasOpenSession: sessions.open !== null,
  });

  if (route.kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (route.kind === "profileError") {
    return (
      <View style={styles.center}>
        <Notice message={route.message} detail={route.detail} onRetry={profile.reload} />
      </View>
    );
  }

  if (route.kind === "onboarding") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs">{() => <Tabs initialTab={route.initialTab} />}</Stack.Screen>
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
});
