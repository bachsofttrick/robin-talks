# Borel Runtime Modules

Two plain JavaScript files at the project root provide runtime plumbing. Both are dependency-free of Borel itself and can be kept or replaced.

## `borel-store.js`

An 876-line reactive store built on `useSyncExternalStore`, with AsyncStorage persistence. The public entry point is `createStore(key, initial, options)` (`borel-store.js:119`).

Store API (`borel-store.js:403`):

| Member | Behaviour |
|---|---|
| `use()` | Current value inside a component; re-renders on change |
| `get()` | Current value anywhere |
| `set(next)` | Replace, or `set((prev) => next)` |
| `useStatus()` | `{ ready, error, detail, retry }` |
| `subscribe(fn)` | Called after every change; returns unsubscribe |
| `reset()` | Back to the initial value |

Options are `{ persist, storage, version, migrate }` (`:126-132`). Persisted values are written under `borel-store:<key>`, and data that fails to migrate or whose kind no longer matches `initial` is kept aside under `borel-store:<key>:backup` (`:107-117`, `:254-258`). Writes are debounced (`:210-216`). The same key always returns the same store (`:123-124`).

Other exports include `usePersistedState`, `getStore`, `createCollection`, visit/first-run/milestone helpers, and `configureAppMemory` (`borel-store.js:415-864`). App code reaches `createStore` through the typed `createAppStore` wrapper in `src/lib/api/store.ts:21-42`, which returns the same store per key (`:22-23`, `:40-41`). The three app stores (`robin.profile` in `src/lib/api/useProfile.tsx:17`, `robin.openSession` in `src/lib/api/useSessions.tsx:33`, `robin.memory` in `src/lib/api/useMemory.tsx:12`) are created without `persist`, so no phone copy is kept; persistence defaults off in `createStore` (`borel-store.js:126`).

## `borel-systemui.js`

A thin bridge over Expo native modules. Modules are required lazily through `nativeModule(name, loader)` so an app without a given native module still loads; Expo Go is detected explicitly where StoreKit or similar is unavailable (`borel-systemui.js:69-77`, `:707-721`).

Exported capabilities, grouped:

- Permissions and biometrics: `requestPermission`, `getPermissionStatus`, `requestFaceID` (`:103`, `:136`, `:171`).
- Media: `pickImage`, `pickImageAsset`, `launchCamera`, `startRecording`, `stopRecording`, `cancelRecording`, `getRecordingStatus`, `recordAudio` (`:261-590`).
- Speech: `speak`, `stopSpeaking`, `isSpeaking` (`:590-661`).
- Purchases: `requestApplePay`, `requestPurchase`, `restorePurchases`, `getProducts` (`:675-1038`). Product slugs are mapped through `Constants.expoConfig.extra.borelIap` (`:727-737`).
- Sharing and clipboard: `shareContent`, `readClipboard` (`:1075`, `:1087`).
- Notifications: `showNotification`, `cancelNotification`, `onNotificationTapped`, `registerForPushNotifications` (`:1237-1495`).
- Location and Apple sign-in: `getCurrentLocation`, `signInWithApple` (`:1388`, `:1426`).
- Links and UI helpers: `useIncomingLink`, `getInviteCode`, `clearIncomingLink`, `triggerHaptic`, `subscribeKeyboardFrame`, `getKeyboardFrame` (`:1659-1709`).

### What the app actually imports

`src/screens/Session/useTurnRecorder.ts:2-9` imports `getPermissionStatus`, `requestPermission`, `startRecording`, `stopRecording`, `cancelRecording`, and `getRecordingStatus`. `src/screens/Session/index.tsx:17` imports `speak` and `stopSpeaking`. `src/lib/core/auth.tsx:9` imports `signInWithApple` as `appleSheet`. The remaining exports are unused by app code in this repository.

### Recording and pause detection

`createRecorder` requests metering up front with `isMeteringEnabled: true` on both the high preset and the low preset (`borel-systemui.js:356-368`), so `getRecordingStatus().metering` carries a real 0..1 level. `useTurnRecorder` (`src/screens/Session/useTurnRecorder.ts:30-148`) polls that level every 150 ms (`:27`, `:91-108`) and feeds each sample to the pure `nextVoiceActivity` detector (`src/screens/Session/voiceActivity.ts:46-91`), which ends the turn after 1500 ms of quiet once speech was heard, or at the 30 s ceiling (`:7-11`). A missing level counts as silence (`:20-24`, `:58-61`). The hook exposes `{ recording, denied, start, stop, cancel, enableMic }` (`:147`) and cancels the poll timer plus recording on unmount (`:134-145`).

### `requestApplePay` is deliberately not implemented

The function returns `{ status: "failure" }` and logs a warning (`borel-systemui.js:675`). `README.md:70-77` documents that shipping a fake success would report completed payments without charging.
