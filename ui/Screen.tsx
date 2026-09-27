import React from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The one place this app deals with the hardware. The status bar and Dynamic
// Island at the top and the home indicator at the bottom are drawn OVER the
// app, so every screen's content lives inside the padding below - and the
// numbers come from the device itself, never written by hand, because they
// differ on every iPhone generation.
//
// Every prop here has a default that is right for an ordinary screen, so
// `<Screen>` on its own does the whole job. They exist so that a screen which
// genuinely needs something else - a long form that scrolls, a full-bleed
// canvas, a chat that positions its own composer - can say so instead of being
// forced to stop using Screen and lose the insets with it.

type ScreenEdge = "top" | "bottom";

// The space between the content and the left and right edges of the phone. A
// title or a card that starts at the very edge looks broken in the hand even
// though nothing in the code is wrong, so every screen gets this unless it says
// otherwise. Set when the app was first built, from the side padding its
// screens were written against.
const GUTTER = 20;

/** The side padding every screen gets, for a row that has to line up with it or run past it. */
export const SCREEN_GUTTER = GUTTER;

type Style = Record<string, unknown>;
const SIDE_PADDING = ["padding", "paddingHorizontal", "paddingLeft", "paddingRight", "paddingStart", "paddingEnd"];
const SIDE_MARGIN = ["margin", "marginHorizontal", "marginLeft", "marginRight", "marginStart", "marginEnd"];

function flat(style: unknown): Style {
  if (typeof style === "function") return {};
  return (StyleSheet.flatten(style as StyleProp<ViewStyle>) ?? {}) as Style;
}

const sets = (style: Style, keys: string[]) => keys.some((key) => style[key] !== undefined && style[key] !== null);

// A card, a banner, anything with a visible edge. Padding inside one moves its
// text in, but the card itself still runs all the way to the edge of the phone.
const isSurface = (style: Style) =>
  (style.backgroundColor !== undefined && style.backgroundColor !== "transparent") ||
  Number(style.borderWidth) > 0 ||
  Number(style.borderRadius) > 0 ||
  Number(style.elevation) > 0 ||
  Number(style.shadowOpacity) > 0;

// Whether the content already keeps itself off the edges, in which case the
// gutter would be a second one on top: a single scroller or wrapper that pads
// its own content, or rows that each carry their own side margin. Read from the
// real style values, so a spacing token that does not exist counts as the
// nothing it is.
function padsItsOwnSides(children: React.ReactNode): boolean {
  const rows: React.ReactElement<Style>[] = [];
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement<Style>(child)) continue;
    if (child.type !== React.Fragment) {
      rows.push(child);
      continue;
    }
    for (const inner of React.Children.toArray(child.props.children as React.ReactNode)) {
      if (React.isValidElement<Style>(inner)) rows.push(inner);
    }
  }
  if (rows.length === 1) {
    const style = flat(rows[0].props.style);
    return sets(flat(rows[0].props.contentContainerStyle), SIDE_PADDING) || sets(style, SIDE_PADDING) || sets(style, SIDE_MARGIN);
  }
  // A horizontal carousel or an absolutely placed overlay is meant to reach the
  // edges, so it neither needs the gutter nor shows that the other rows do not.
  const inset = rows.filter((row) => row.props.horizontal !== true && flat(row.props.style).position !== "absolute");
  return (
    inset.length > 0 &&
    inset.every((row) => {
      const style = flat(row.props.style);
      return (
        sets(style, SIDE_MARGIN) ||
        (sets(style, SIDE_PADDING) && !isSurface(style)) ||
        sets(flat(row.props.contentContainerStyle), SIDE_PADDING)
      );
    })
  );
}

export function Screen({
  children,
  style,
  scroll = false,
  contentContainerStyle,
  edges = ["top", "bottom"],
  keyboard = true,
  gutter,
  padded,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Put the content in a ScrollView. For anything taller than the screen. */
  scroll?: boolean;
  /** Passed to that ScrollView, for padding under the last row. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Which safe-area edges to inset. `[]` for a deliberately full-bleed screen. */
  edges?: ScreenEdge[];
  /** Lift content above the keyboard. Turn off if this screen positions its own input. */
  keyboard?: boolean;
  /** Side padding. On unless the content pads its own sides; false to run edge to edge, or a number. */
  gutter?: boolean | number;
  /** The same switch, under the name many Screens use for it. */
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
  };
  const asked = gutter ?? padded;
  const side =
    asked === false
      ? 0
      : typeof asked === "number"
        ? asked
        : asked === true
          ? GUTTER
          : edges.length === 0 || padsItsOwnSides(children)
            ? 0
            : GUTTER;
  // Side padding handed to Screen itself always wins, whole, and is never added
  // to. The gutter goes last in each array only so that an undefined spacing
  // token earlier in it cannot erase the gutter.
  const own = { ...flat(style), ...(scroll ? flat(contentContainerStyle) : {}) };
  const sides = side > 0 && !sets(own, SIDE_PADDING) ? { paddingHorizontal: side } : null;
  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[contentContainerStyle, sides]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <View style={[styles.container, padding, style, scroll ? null : sides]}>
      {keyboard ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fill}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

export default Screen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F5F0" },
  fill: { flex: 1 },
});
