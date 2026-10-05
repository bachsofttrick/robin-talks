# Bugfix: Recording stop control and the Android "AI couldn't answer" recording error

Status: approved
Bug report (verbatim):
"Recording stop button (red button at the end of the row) doesn't work. How do I stop recording and not send the audio without that button?
When using this app on Android (Expo Go), I got an error 'The AI couldn't answer that right now...' with the recording part."

## Analysis

Two defects on the turn-recording path: one root (no way to stop without sending,
and the stop control is inert), one symptom (Android shows a generic AI error for
a recording the app could not use).

### Bug 1: the "red button at the end of the row" is not a button

`src/screens/Session/index.tsx:401-403` renders the red/orange square
(`colors.accent2` `#D97A3D`, `src/lib/ui/theme.ts:12`) as a bare `Square` icon
inside the composer `View`, with no `Pressable` wrapper and no `onPress`. Tapping
it does nothing: no state change, no request, no navigation. A web-preview
reproduction (Playwright, mic granted) confirmed the click is inert and the
ancestor chain has no clickable element.

The only stop path wired to `recording` is `stopAndSend`
(`src/screens/Session/index.tsx:217-234`), which stops, transcribes, and sends.
There is no discard control. The bridge already exposes `cancelRecording()`
(`borel-systemui.js:496-509`), which stops the recorder, clears the limit, and
restores the audio mode, but `src/screens/Session/index.tsx` never imports it
(imports at `index.tsx:16-23`). So the user's two complaints are the same missing
capability: no control stops recording without sending, and the element that
looks like it should is decorative.

Two related lifecycle holes: switching to typing (`index.tsx:398`) and leaving
the screen (`index.tsx:117`) do not stop an active recording, so the recorder
keeps running outside the UI.

### Bug 2: Android reports "The AI couldn't answer that right now" for a recording it cannot use

The exact sentence is `AI_SAYS.failed` (`src/lib/core/db/ai.ts:153`). In the
recording flow it is produced when `transcribeOnce` (`ai.ts:387-411`) gets a
non-OK HTTP response whose body is not "plain", via `openRouterSays`
(`ai.ts:296-301`, fallback at line 300).

Live API probes against `POST https://openrouter.ai/api/v1/audio/transcriptions`
with the app's exact body (`{ model: "qwen/qwen3-asr-0.6b", input_audio: { data, format } }`)
established the mechanism:

- A valid 30 s, 44.1 kHz, stereo AAC `.m4a` (the Android `HIGH_QUALITY`
  profile, `node_modules/expo-audio/build/RecordingConstants.js`) returns
  **HTTP 200**, so format, size, sample rate, and channel count are not the
  problem.
- An empty payload (`data: ""`, or a `data:` URL with no bytes) returns
  **HTTP 400** `{"error":{"message":"Provider returned 400","code":400}}`.
- A truncated/corrupt `.m4a` returns **HTTP 400**
  `{"error":{"message":"Provider could not process the audio input (unsupported or malformed audio)","code":400}}`.

Both messages end in a digit or `)`, so `looksPlain` rejects them
(`src/lib/core/db/errors.ts:27-53`, final-character test at line 34) and
`openRouterSays` falls through to `AI_SAYS.failed`.

**Proven:** the app produces an empty or malformed recording and POSTs it; the
provider answers 400 with an unplain message; the app shows the generic AI error.
**Not proven:** which lifecycle defect produced the bad file, since no Android
device or emulator is available here. Two candidates exist and both are worth
closing:

1. `advance` opens the mic immediately after `say(reply.text)` without awaiting
   TTS (`index.tsx:197-202`); `say` returns nothing (`index.tsx:119-121`). Spec
   AC-7 requires the mic to open only when Robin has **finished** speaking
   (`docs/agent-docs/specs/260919-robin-english-practice/spec.md`), and the spec's
   plan says `say` should return the `speak` promise. On Android this starts the
   recorder while the TTS engine holds the audio session. This is a confirmed
   AC-7 defect regardless of whether it is the 400 cause.
2. The 30 s auto-stop in the bridge calls `activeRecorder.stop()` without
   awaiting and without clearing `activeRecorder` (`borel-systemui.js:450-460`);
   a later `stopRecording()` (`borel-systemui.js:469-494`) calls `stop()` a second
   time, so two stops can race and read the file before it is finalized. With the
   red button inert, waiting out the 30 s timer is exactly what a stuck user does.

A related gap: `db.ai.transcribe` does not reject an empty resolved recording, so
a zero-byte capture is still POSTed.

## Reproduction

- Bug 1: reproduced in the web preview at `http://localhost:8081`. Open a scene,
  recording auto-starts after Robin's first line, click the red square at the end
  of the composer row. Observed: nothing happens (still "Stop and send", no
  network request, no console error). Expected: a control that stops the
  recording. Confirmed `cancelRecording` exists (`borel-systemui.js:496`) with no
  caller in `src/`.
- Bug 2: not reproducible in this environment (no Android device or emulator;
  `adb devices` empty, no AVD). The failure mechanism was reproduced against the
  live STT endpoint: valid 30 s stereo m4a -> 200; empty -> 400 "Provider
  returned 400"; truncated -> 400 "Provider could not process the audio input
  (unsupported or malformed audio)". Both 400 bodies map to the reported
  sentence. The upstream step (why the Android file comes out empty) is
  inference from the two lifecycle defects above.

## Fix Approach

Make the recording lifecycle explicit and single-owner, and never let a recording
the app itself cannot use become a provider error.

1. Await TTS before opening the mic: `say` returns the `speak` promise and
   `advance` awaits it before `openMic`, and `openMic` stops any speech first,
   per AC-7.
2. Guard the post-await continuation with an alive check and a turn token, so an
   unmount, a "Finish now", or a newer turn cannot start a recording after the
   fact. The `complete` branch awaits speech before `finish`, so the final line
   plays out and `finish` never cuts it off.
3. Give the red square a real job: a `Pressable` that cancels the recording and
   discards it (`cancelRecording` + state reset) without sending, with an
   accessibility label and a discard-signalling icon. Cancel recording when
   switching to typing and on unmount too.
4. Serialize the stop so the 30 s auto-stop and a manual stop share one
   `recorder.stop()` promise.
5. Add an empty-audio guard in `db.ai.transcribe`, before `askAiConsent`: when
   the resolved audio has no bytes, return the local "No words were heard..."
   sentence instead of POSTing.

## Affected Code

- `src/screens/Session/index.tsx`:
  - `say` returns the `speak` promise (`index.tsx:119-121`).
  - `advance` awaits `say` and guards the continuation with `aliveRef` and a
    `turnRef` token (`index.tsx:166-205`).
  - `openMic` calls `stopSpeaking()` first (`index.tsx:123-138`).
  - New `cancelAndDiscard` handler; the red `Square` becomes a `Pressable`
    (icon changed to a discard-signalling one, `accessibilityLabel` added)
    (`index.tsx:401-403`); switching to typing and unmount both cancel
    (`index.tsx:398`, `index.tsx:117`).
  - Import `cancelRecording` (`index.tsx:16-23`).
- `borel-systemui.js`: one shared stop promise used by the 30 s limit,
  `stopRecording`, and `cancelRecording`, so `recorder.stop()` runs once
  (`borel-systemui.js:450-460, 469-494, 496-509`).
- `src/lib/core/db/ai.ts`: `sendableAudio` raises a distinct "empty recording"
  error for a recording object with no bytes; `transcribe` maps that and an empty
  resolved `data:` payload to `AI_SAYS.noSpeech` before `askAiConsent`
  (`ai.ts:114-140, 497-513`).
- `src/lib/core/db/ai.test.ts`: cover the empty-audio guard (no `fetch`, returns
  `noSpeech`) for both `{ base64: "" }` and an empty resolved payload.

## Notes

- `borel-systemui.js` is Borel-generated vendor code and a regeneration may
  overwrite it; the prior bugfix
  (`docs/agent-docs/plans/261005-voice-recording-broken/PLAN.md`) accepted the
  same trade-off. The edit here is one stop-promise guard.
- The full spec design (`useTurnRecorder`, silence detection, temp-file deletion)
  is out of scope; this fix stays on the current API and patches the divergences
  that produce these two bugs.
