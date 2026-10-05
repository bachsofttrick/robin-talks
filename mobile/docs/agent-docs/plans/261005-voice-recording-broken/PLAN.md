# Bugfix: Voice recording fails in the browser preview

Status: approved
Bug report: "There is a bug preventing me from recording my voice to do practice. The texting still works fine."

## Analysis

The app runs in the Expo **web** preview, but the Borel bridge `borel-systemui.js`
gates every audio call behind a native-module presence check that is always false
on web, so `expo-audio`'s working web implementation is never loaded. Three
distinct defects sit on the same path.

1. **The bridge never loads expo-audio on web.**
   `nativeModule(nativeName, load)` (`borel-systemui.js:57-67`) only calls
   `load()` when `requireOptionalNativeModule(nativeName)` is truthy
   (`borel-systemui.js:61`). On web, `requireOptionalNativeModule` returns `null`
   unless a DOM-webview host injected modules (`expo-modules-core/src/requireNativeModule.web.ts:13-20`),
   and the diagnosis confirmed `globalThis.ExpoDomWebView` is `undefined` and
   `globalThis.expo.modules` has no `ExpoAudio`. So `audioModule()`
   (`borel-systemui.js:76`) returns `null`.
   Failure chain: `Session.openMic` calls `getPermissionStatus("microphone")`
   (`src/screens/Session/index.tsx:124`); the bridge's microphone case
   (`borel-systemui.js:149-151`) does `await audioModule()?.getRecordingPermissionsAsync()`
   -> `undefined`; `borel-systemui.js:158` returns `"denied"`; the screen runs
   `setMicDenied(true); setTyping(true); return;` (`index.tsx:124-129`), aborting
   before `startRecording`. `startRecording` would independently bail at
   `borel-systemui.js:429-430` (`if (!audio) return { started: false, reason: "unavailable" }`).
   `speechModule()` (`borel-systemui.js:77`) is gated the same way, so Robin's
   text-to-speech is silent on web too.

2. **Even once loaded, the recorder class is native-only.**
   `createRecorder` (`borel-systemui.js:354-371`) does
   `new AudioModule.AudioRecorder(...)`. expo-audio's web build exports
   `AudioRecorderWeb`, not `AudioRecorder` (`node_modules/expo-audio/build/ExpoAudio.web.js:135`
   re-exports `AudioModule`; `AudioModule.web.js:6` exports `AudioRecorderWeb`).
   `AudioModule.AudioRecorder` is `undefined` on web, so the constructor throws
   and `startRecording` returns `{ started: false, reason: "unavailable" }`.

3. **The reported MIME type is wrong on web.**
   `finalizeRecording` (`borel-systemui.js:415`) hardcodes
   `mimeType: "audio/m4a"`, but the web `MediaRecorder` records `audio/webm`
   (`node_modules/expo-audio/build/RecordingConstants.js:83-86`,
   `AudioRecorder.web.js:153-158`). `sendableAudio` derives the format sent to
   OpenRouter from `recording.mimeType` (`src/lib/core/db/ai.ts:131`), so the
   audio would be labeled `m4a` while its bytes are `webm`.

Typing works because `sendTyped` (`index.tsx:236-242`) never touches
`audioModule`; it goes straight to OpenRouter chat and the Borel DB, which are
healthy.

## Reproduction

Reproduced by a diagnosis subagent in the already-open Playwright session at
`http://localhost:8081` (Expo web), twice, including with browser mic permission
pre-granted:

- Open a scene on the Session screen, press **"Speak your reply"**.
- Observed: the button vanishes with no **"Stop and send"**; the UI switches to
  typing mode showing "Robin cannot hear you without the microphone. Typing
  still works." The "Turn the microphone on" link is a no-op.
- Expected: recording starts, "Stop and send" appears, and stopping transcribes.
- Console: no app error, no `getUserMedia` call, no transcribe request. Runtime
  probe: `navigator.mediaDevices.getUserMedia({audio:true})` succeeds and
  `navigator.permissions.query({name:'microphone'})` is `"granted"`, so the mic
  hardware and permission are healthy; the app never tries.
- Typing a reply and sending worked (`POST openrouter.ai/api/v1/chat/completions`
  200, `PATCH .../practice_sessions` 204).

## Fix Approach

Make the bridge web-aware without changing native behavior. In
`borel-systemui.js`: let `nativeModule` run its loader on web **only for an
explicit per-module opt-in** (audio and speech), so no other optional module is
ever forced through a web load and a missing web build cannot hard-crash Metro;
have `createRecorder` pick
`AudioModule.AudioRecorder ?? AudioModule.AudioRecorderWeb`; and have
`finalizeRecording` report the blob's actual MIME type only when it is a real
audio type, falling back to `audio/m4a` otherwise, so OpenRouter is told `webm`
on web and native keeps `m4a`. This restores recording and Robin's spoken
replies in the browser preview while leaving the iOS/Android path unchanged.

Reviewer conditions folded in:

1. The web bypass is a per-module opt-in, never a blanket `Platform.OS === "web"`
   branch in `nativeModule`.
2. MIME detection uses `blob.type` only when it starts with `audio/`; otherwise
   the native `audio/m4a` value is kept.
3. Verification includes a smoke check that `require("expo-audio")` evaluates on
   web without throwing, plus a live record -> stop -> transcribe run.
4. The fix is transient: `borel-systemui.js` is Borel-generated and a future
   regeneration may overwrite it. This is accepted for now; the app-owned
   alternative is noted below.

## Affected Code

- `borel-systemui.js:57-67` (`nativeModule`): add an opt-in web bypass so the
  loader runs on web when the module has a web build.
- `borel-systemui.js:76-77` (`audioModule`, `speechModule`): opt both into the
  web bypass. This fixes recording and text-to-speech in the preview.
- `borel-systemui.js:354-371` (`createRecorder`): use
  `AudioModule.AudioRecorder ?? AudioModule.AudioRecorderWeb`.
- `borel-systemui.js:396-419` (`finalizeRecording`): derive `mimeType` (and
  `fileName`) from the fetched blob's audio type instead of hardcoding `audio/m4a`.

## Known Risk (tracked, not fixed here)

The 30 s auto-stop timeout (`borel-systemui.js:443-453`) calls
`activeRecorder.stop()` without awaiting. On web, `AudioRecorderWeb.stop()` nulls
`this.mediaRecorder` synchronously and sets `uri` only after `dataavailable`; a
"Stop and send" tap inside that window makes the second `stop()` throw (caught)
and can read `uri === null`, surfacing "Did not catch that." This race already
exists on native and is widened slightly on web. Out of scope for this bug.

## Out of Scope

- Adding a full `borel-systemui.web.js` shim. The bridge comments reference one,
  but it was never generated or committed, and reimplementing the entire surface
  is disproportionate to this bug.
- Moving the fix into app-owned code (a `Platform.OS === "web"` recording path in
  `src/lib/api/` or the Session screen) to survive Borel regeneration. More code,
  diverges from the bridge's role, and out of scope here; the bridge edit is the
  smallest correct fix.
- The secondary observation that expo-audio's web `getRecordingPermissionsAsync`
  can raise a prompt on `undetermined` (`AudioModule.web.js:89-91`). That is a
  prompt, not a failure, and is acceptable.
- A unit test for the new MIME branch. `finalizeRecording` is not exported and
  the bug is web-runtime-specific; verification is the browser end-to-end run.
