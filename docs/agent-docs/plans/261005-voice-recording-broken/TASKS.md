# Tasks: Voice recording fails in the browser preview

Status: complete
Plan: PLAN.md

## Wave 1

- [x] T1: Make the Borel bridge web-aware for audio and speech
  - Files: `borel-systemui.js`
  - Do:
    1. In `nativeModule(nativeName, load)` (lines 57-67), add an explicit
       per-module opt-in for web instead of a blanket branch. Suggested shape:
       `function nativeModule(nativeName, load, web = false)` and the guard
       `if ((web && Platform.OS === "web") || requireOptionalNativeModule(nativeName)) loaded = load() ?? null;`.
       `Platform` is already imported at line 32. Do NOT change the semantics for
       any other module; only modules that opt in may load on web.
    2. Opt `audioModule` and `speechModule` (lines 76-77) into the bypass by
       passing `true` as the third argument. Leave the other nine module helpers
       untouched.
    3. In `createRecorder` (lines 354-371), resolve the recorder class as
       `const Recorder = AudioModule.AudioRecorder ?? AudioModule.AudioRecorderWeb;`
       and use `new Recorder(...)` in both the high-quality and low-quality
       branches. Native keeps `AudioRecorder`; web gets `AudioRecorderWeb`.
    4. In `finalizeRecording` (lines 396-419), read the fetched blob's type and
       use it only when it is a real audio type, otherwise keep `audio/m4a`.
       Suggested shape: initialize `let mimeType = "audio/m4a";` before the
       try, and inside the try after `const blob = await response.blob();` add
       `if (typeof blob.type === "string" && blob.type.startsWith("audio/")) mimeType = blob.type;`.
       Return `mimeType`, and set `fileName` from it (`.webm` when the type is
       webm, otherwise `.m4a`). Keep the existing `base64`, `uri`, `size`,
       `durationMs`, and `fileSize` fields and the size/base64 behavior intact.
  - Done when:
    - In the browser preview, tapping "Speak your reply" prompts for (or uses
      granted) microphone access and switches to the "Stop and send" button
      instead of the "Robin cannot hear you" notice.
    - Recording, then "Stop and send", transcribes the speech and advances the
      conversation (a new user turn and a Robin reply appear).
    - `require("expo-audio")` evaluates on web without throwing (no Metro
      `guardedLoadModule` fatal), and `require("expo-audio").AudioModule.AudioRecorderWeb`
      is used.
    - Native behavior is unchanged: `AudioModule.AudioRecorder` still wins on
      iOS/Android, and the MIME fallback stays `audio/m4a` when the blob type is
      empty or non-audio.
    - `bun run lint` and `bun run typecheck` pass; `bun run test` stays green.
