import { useSafeAreaInsets } from "react-native-safe-area-context";

// Written by Borel when this app was first built, and an ordinary file in it
// now. The one tab-bar shape that is right on every iPhone: React Navigation
// reads `height` as the bar's TOTAL including the home indicator, and replaces
// its own bottom padding with any the app writes, so both are composed from
// the device's real inset here. 62pt of content leaves room for a 28pt icon
// wrapper, an 11pt label and the padding around them; the library's 49pt
// default clips the labels along a straight line.

export interface TabBarColors {
  /** The bar's fill, usually the theme's surface. */
  background: string;
  /** Its top edge, usually the theme's border. */
  border: string;
  /** The selected tab, usually the accent. */
  active: string;
  /** The other tabs, usually the muted text colour. */
  inactive: string;
}

/**
 * Spread into a bottom tab navigator's screenOptions:
 *   const tabBar = useTabBarOptions({ background, border, active, inactive });
 *   <Tab.Navigator screenOptions={{ headerShown: false, ...tabBar }}>
 */
export function useTabBarOptions(colors: TabBarColors) {
  const insets = useSafeAreaInsets();
  return {
    tabBarStyle: {
      height: 62 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 6,
      backgroundColor: colors.background,
      borderTopColor: colors.border,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const },
    tabBarActiveTintColor: colors.active,
    tabBarInactiveTintColor: colors.inactive,
  };
}

export default useTabBarOptions;
