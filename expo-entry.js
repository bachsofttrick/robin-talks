import "./src/lib/polyfills/cryptoPolyfill";
import "./src/lib/polyfills/responsePolyfill";
import "./src/lib/polyfills/alertPolyfill";
import React from "react";
import { registerRootComponent } from "expo";
import { SafeAreaProvider } from "react-native-safe-area-context";

import App from "./index";

// registerRootComponent calls AppRegistry.registerComponent("main", () => Root)
// and makes the app work the same whether it is loaded in Expo Go or in a
// native build. The app's own source lives at the project root, so "./index"
// below is index.tsx — the entry Borel generated.
//
// SafeAreaProvider wraps it here so every screen's useSafeAreaInsets() has a
// value on a real device — the notch/Dynamic Island and home indicator insets
// this phone actually reports, whichever iPhone it is.
function Root() {
  return React.createElement(SafeAreaProvider, null, React.createElement(App));
}

registerRootComponent(Root);
