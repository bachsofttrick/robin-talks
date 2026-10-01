import React from "react";
import { StatusBar } from "expo-status-bar";
import ErrorHandler from "./src/lib/ui/ErrorHandler";
import { AppFonts } from "./src/lib/ui/fonts";
import { CoreProviders } from "./src/lib/core";
import { NavigationContainer } from "./src/navigation/NavigationContainer";
import RootNavigator from "./src/navigation/RootNavigator";

// Written by Borel from this app's own files, and rewritten whenever they
// change: the error boundary outermost, the status bar in the app's own
// scheme, every provider a screen reads, then the navigator. To take this
// file over, put the line `// borel: custom entry` at its top and Borel
// leaves it alone from then on.
export default function App() {
  return (
    <ErrorHandler>
      <StatusBar style="dark" />
      <AppFonts>
        <CoreProviders>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </CoreProviders>
      </AppFonts>
    </ErrorHandler>
  );
}
