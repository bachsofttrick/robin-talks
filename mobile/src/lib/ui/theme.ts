// The app's visual language, written by Borel from this app's design brief
// because this build did not write one. Every other file reads from here.
//
// learning, calm, encouraging, focused: light scheme, soft radii, hairline edges, standard density.
export const colors = {
  background: "#F7F5F0",
  surface: "#FFFFFF",
  text: "#242320",
  textSecondary: "#63625E",
  textMuted: "#898884",
  accent: "#2F6F5E",
  accent2: "#D97A3D",
  accentSoft: "#E2EBE8",
  border: "#E5E5E4",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  screen: 20,
  section: 28,
} as const;

export const radius = {
  card: 16,
  button: 12,
  input: 12,
  avatar: 999,
} as const;

export const fonts = {
  heading: "Lora_700Bold",
  body: "Manrope_400Regular",
  bodyMedium: "Manrope_500Medium",
  bodyBold: "Manrope_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.heading, fontSize: 32, letterSpacing: -0.5, lineHeight: 45 },
  title: { fontFamily: fonts.heading, fontSize: 24, letterSpacing: -0.3, lineHeight: 34 },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24 },
  secondary: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
} as const;

/** How a surface separates from the page behind it: this app's edge language
 * as real style props. Spread it onto a card rather than writing shadow or
 * border props per screen. */
export const elevation = {
  surface: { borderWidth: 1, borderColor: "#E5E5E4" },
  raised: { borderWidth: 1, borderColor: "#CFCFCE" },
  none: {},
} as const;

/** One stroke width for every icon in the app. */
export const iconStroke = 2;

/** This app's expressive direction as tokens, from Borel's creative director:
 * what the surfaces are made of, how things move, how icons sit. Borel's own
 * ui files read these, and a screen that wants the same answer reads them too. */
export const brand = {
  template: "custom",
  texture: { kind: "paper", opacity: 0.35, tint: colors.text },
  motion: {
    preset: "calm",
    enter: 420,
    stagger: 70,
    press: { scale: 0.985, opacity: 0.92 },
    spring: null as { damping: number; stiffness: number } | null,
  },
  icon: { stroke: iconStroke, size: { sm: 16, md: 20, lg: 24 }, well: "circle", wellSize: 36, wellTint: colors.accentSoft },
  heroImage: undefined as string | undefined,
} as const;

/** One answer per element class, derived from the tokens above. Extend these
 * (`{ ...components.card, borderRadius: 4 }`) rather than restating them. */
export const components = {
  button: { height: 52, borderRadius: radius.button, paddingHorizontal: 20, fontSize: type.body.fontSize },
  card: { borderRadius: radius.card, padding: 16, backgroundColor: colors.surface, ...elevation.surface },
  input: { height: 48, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 },
  tabBar: { background: colors.surface, border: colors.border, active: colors.accent, inactive: colors.textMuted, style: "docked" as "docked" | "floating" | "glass" },
  header: { height: 56, titleSize: type.title.fontSize },
} as const;

export const theme = { colors, spacing, radius, type, fonts, elevation, iconStroke, brand, components } as const;
export default theme;
