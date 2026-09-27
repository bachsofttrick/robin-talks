import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

// A real error boundary. Without one a single thrown render turns the whole app
// into a blank screen with no way back.
const BACKGROUND = "#F7F5F0";
const TEXT = "#242320";
const ACCENT = "#2F6F5E";

interface ErrorHandlerProps {
  children: React.ReactNode;
}

interface ErrorHandlerState {
  error: Error | null;
}

export default class ErrorHandler extends React.Component<ErrorHandlerProps, ErrorHandlerState> {
  state: ErrorHandlerState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorHandlerState {
    return { error };
  }

  // Hands the error out to whatever is hosting this app, then carries on
  // showing the recovery screen below.
  //
  // React catches at the NEAREST boundary, and this one sits inside Borel's
  // own (expo-runtime/App.js). So every screen throw stopped here and the
  // outer boundary never saw one - it posted `app-ready`, the preview went
  // green over a crashed app, and the automatic repair never fired. Reporting
  // it is the whole difference between a verified build and a verified-looking
  // one.
  //
  // Optional call, never a bare one: in a downloaded project or an App Store
  // build nothing installs this global, and turning a caught render error into
  // a second uncaught one would be strictly worse than staying quiet.
  // React's info goes with it: its component stack is what names the screen
  // that threw when the error's own message names nothing.
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    (globalThis as { __borelRenderError?: (e: Error, i?: React.ErrorInfo) => void }).__borelRenderError?.(error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // The exception is for whoever is building the app, never for the person
    // using it: it can quote a database column, a URL with a token in it, or
    // "undefined is not a function". __DEV__ is false in every store build.
    const message = __DEV__ ? error.message : "Please try again. If it keeps happening, close the app and open it again.";
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{message}</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: BACKGROUND, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: TEXT },
  body: { fontSize: 15, lineHeight: 22, color: TEXT, opacity: 0.7, textAlign: "center" },
  button: { backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 24, minHeight: 48, justifyContent: "center" },
  buttonLabel: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
