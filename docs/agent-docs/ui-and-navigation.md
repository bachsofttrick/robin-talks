# UI and Navigation

## Navigation

React Navigation 7 is wired in `src/navigation/`:

- `NavigationContainer.tsx` builds `navigationTheme` from `DefaultTheme` with the app's colours and passes it to `RNNavigationContainer` (`src/navigation/NavigationContainer.tsx:9-26`).
- `RootNavigator.tsx` defines two param lists: `RootTabParamList` (`Practice`, `Session`, `Settings`) and `RootStackParamList` (`Tabs`, `Onboarding`) (`:14-23`).
- `RootNavigator.tsx` renders the result of the pure `rootRoute(input)` decision (`src/navigation/rootRoute.ts:23-31`): `loading` (auth, profile, or open-session read in flight), `profileError` (failed profile read with no onboarded profile, retryable via `profile.reload`), `onboarding`, or `tabs` with `initialTab` set to `Session` when an open session exists, else `Practice` (`src/navigation/RootNavigator.tsx:66-105`).
- The tab navigator has `headerShown: false` and merges `useTabBarOptions` into its `screenOptions` (`:39`). Icons are lucide `Home`, `Headphones`, and `Settings` at size 22 with `iconStroke` (`:40-54`).

Files are wired through barrels: `src/navigation/index.tsx` and `src/screens/index.tsx`.

## Screens

### Onboarding (`src/screens/Onboarding/index.tsx`)
Two inputs: a name field and a level choice (`Beginner`, `Intermediate`, `Advanced`, each with a blurb) (`:13-17`, `:50-78`). Submits through `useProfile().save`, validating a non-empty name (`:27-37`). Uses `Screen scroll`, `Paper`, `Bird`, `Field`, `Button`, and `Notice`.

### Practice (`src/screens/Practice/index.tsx`)
The catalog. Picks a suggested scenario as the first entry whose `level` matches the profile level, falling back to the first scenario (`:52-55`). The featured hero card shows all four fields: title (`:82`), description (`:84`), goal (`:85`), and level (`:86`), plus a start button (`:87-92`). Shows a resume card when `useSessions().open` exists (`:98-109`), and the remaining scenarios in a list with a `SectionHeader` (`:111-114`). Reloads sessions on focus via `useFocusEffect` (`:46-50`). Wrapped in `RequireAccount reason="to practise with Robin"` (`:119-125`).

### Session (`src/screens/Session/index.tsx`)
The practice loop; see architecture.md for the lifecycle. Key UI states:

- No session/scenario -> `EmptyState` with a "Choose a scene" action (`:303-315`).
- Debrief present -> summary, "Better phrasings" list, "To work on" tips, "Back to scenes" (`:317-349`).
- Live -> header with "Finish now", a scrolling transcript (Robin turns left with a replay control, user turns right-aligned), and a composer that switches between voice and typing.
- Microphone denial shows a notice and a "Turn the microphone on" link that calls `enableMic` (`:138-141`, `:395-402`).

### Settings (`src/screens/Settings/index.tsx`)
Edits name and level, saves via `useProfile().save` (`:32-43`), and offers "Delete all sessions" and "Delete all memory" behind confirmation Alerts (`:45-63`). Deletion is disabled while a session is open (`:30`, `:97-107`). Shows the memory count with the note "Your voice is never stored, only the text" (`:101-103`). Includes `AccountPanel` and `LegalLinks` (`:109-111`). Wrapped in `RequireAccount reason="to manage your practice"`.

## Design system

All tokens live in `src/lib/ui/theme.ts`:

- `colors` - warm light palette; accent `#2F6F5E`, accent2 `#D97A3D`, background `#F7F5F0` (`:5-15`).
- `spacing` (`xs` 4 to `screen`/`section` 20/28), `radius` (`card` 16, `button`/`input` 12) (`:17-32`).
- `fonts` - Lora 700 for headings, Manrope 400/500/700 for body (`:34-39`).
- `type` - `display`, `title`, `body`, `secondary`, `caption` presets (`:41-47`).
- `elevation`, `iconStroke = 2`, and `brand` (texture, motion, icon defaults) (`:52-76`).
- `components` - per-element defaults such as button height 52 and card styling (`:80-86`).

`src/lib/ui/fonts.tsx` loads exactly the four faces the theme names and paints the background until they are ready (`src/lib/ui/fonts.tsx:16-21`).

Reusable components are exported from `src/lib/ui/index.tsx`: `Bird`, `Button`, `EmptyState`, `ErrorHandler`, `Field`, `AppFonts`, `Notice`, `Screen`, `SectionHeader`, `useTabBarOptions`, `Paper`, and the theme plus `useEnter`/`usePress`/`useStagger`.

- `Screen` handles safe-area insets, a 20pt gutter, keyboard avoidance, and an optional `ScrollView`; it inspects children to avoid doubling the gutter (`src/lib/ui/Screen.tsx:86-154`).
- `Button` has `primary`, `outline`, and `quiet` variants with press animation (`src/lib/ui/Button.tsx`).
- `Notice` renders one plain sentence, an optional hidden `detail` behind "Details", and an optional retry (`src/lib/ui/Notice.tsx`).
- `Paper` draws an SVG grain texture over a screen (`src/lib/ui/Texture.tsx:10-25`).
- Motion presets use `brand.motion` timings (`src/lib/ui/motion.ts`) and all animations run on the native driver.

## Styling conventions

Screens build `StyleSheet.create` blocks at the bottom of the file and spread `type.*` presets plus `colors.*` rather than hard-coding values. Examples: `src/screens/Practice/index.tsx:124-159`, `src/screens/Settings/index.tsx:124-146`. The auth kit is the exception: it defines its own `KIT` palette in `src/lib/core/auth/constants.ts` and styles `src/lib/core/auth/` with it because the top-level `auth.tsx` is Borel-managed.
