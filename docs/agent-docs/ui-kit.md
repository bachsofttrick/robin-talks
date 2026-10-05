# UI Kit

`src/lib/ui/` holds the visual language and shared components. Import from the
barrel `src/lib/ui/index.tsx`; every screen does.

## Theme (`src/lib/ui/theme.ts`)

The design brief is "learning, calm, encouraging, focused": light scheme, soft
radii, hairline edges. Exported tokens:

- `colors`: `background #F7F5F0`, `surface #FFFFFF`, `text #242320`,
  `textSecondary #63625E`, `textMuted #898884`, `accent #2F6F5E` (green),
  `accent2 #D97A3D` (orange), `accentSoft #E2EBE8`, `border #E5E5E4`.
- `spacing`, `radius`, `fonts` (Lora 700 for headings, Manrope for body), `type`
  (`display`, `title`, `body`, `secondary`, `caption`), `elevation`,
  `iconStroke` (2), and `components` (button/card/input/tabBar/header presets).
- `brand`: the expressive direction as tokens, including `motion.enter` (420 ms),
  `motion.stagger` (70 ms), `motion.press` (scale 0.985, opacity 0.92), and
  `texture` (paper grain, opacity 0.35).

`theme` aggregates the tokens and is exported both named and default.

## Components

- `Screen` (`Screen.tsx`): the single place that handles safe-area insets,
  keyboard avoidance, scrolling, and the side gutter (20 px, exported as
  `SCREEN_GUTTER`). Props: `scroll`, `contentContainerStyle`, `edges`, `keyboard`,
  `gutter`, `padded`. It detects when children already pad their own sides and
  skips the gutter.
- `Button` (`Button.tsx`): variants `primary`, `outline`, `quiet`, with `loading`
  and `disabled`.
- `Field` (`Field.tsx`): labelled text input styled from the theme.
- `Notice` (`Notice.tsx`): the inline row a failed save/load is reported in, above
  the content, with an optional `detail` behind a "Details" tap and an optional
  retry.
- `EmptyState`, `SectionHeader`, `Bird` (the Robin SVG mark), `Texture` (`Paper`,
  the grain overlay), `ErrorHandler` (a class error boundary that reports to
  `globalThis.__borelRenderError` when present).
- `Bird` marks the app brand in every screen: the hero and resume card in
  Practice, the header and each active level in Onboarding, the empty state and
  each Robin turn in Session, the Settings header, the `RootNavigator` splash
  (`src/navigation/RootNavigator.tsx:62-68`), and the signed-out card
  (`src/lib/core/auth/RequireAccount.tsx:31`).
- `TabBar` (`TabBar.tsx`): `useTabBarOptions({ background, border, active,
  inactive })` returns bottom-tab `screenOptions` with a 62 pt bar composed with
  the device's bottom inset.

## Motion (`src/lib/ui/motion.ts`)

Animated helpers driven by `brand.motion`:
- `useEnter(delay?)`: fade + 10 px rise on mount.
- `useStagger(index)`: `useEnter` with a per-index delay capped at index 8.
- `usePress()`: returns `onPressIn`/`onPressOut`/`style` for a press-scale effect.

## Fonts (`src/lib/ui/fonts.tsx`)

Borel-managed. Loads `Lora_700Bold`, `Manrope_400Regular`, `Manrope_500Medium`,
and `Manrope_700Bold` with `useFonts`, painting the background colour until they
are ready so the system font never flashes.

## Auth UI vs app UI

The `core/auth/` account components use their own `KIT` palette
(`src/lib/core/auth/constants.ts`) and local `Field`/`PrimaryButton`/etc. rather
than the app's `ui/` kit. Do not swap one for the other without a reason: that
separation is deliberate, so generated account screens render consistently
across apps.
