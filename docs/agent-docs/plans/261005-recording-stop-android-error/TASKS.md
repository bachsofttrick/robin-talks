# Tasks: Recording stop control and the Android "AI couldn't answer" recording error

Status: complete
Plan: PLAN.md

## Wave 1

- [x] T1: Serialize recorder stop in the Borel bridge
  - Files: `borel-systemui.js`
  - Do:
    1. Near `let activeRecorder = null;` (line 345) add `let activeStop = null;`.
    2. Add a helper above `startRecording`:
       `function stopRecorderOnce(recorder) { if (!activeStop) activeStop = (async () => { try { await recorder.stop(); } catch { /* already stopped */ } })(); return activeStop; }`
    3. In `startRecording`, reset `activeStop = null;` when a new recorder is created/assigned (before `recorder.record()` is fine, as long as it is set for every fresh recording).
    4. In the `recordingLimit` timeout (lines 450-460), replace the bare `activeRecorder.stop()` with `activeStop = stopRecorderOnce(activeRecorder);` (keep the `if (activeRecorder)` guard and the try/catch-free style). Do not clear `activeRecorder` there.
    5. In `stopRecording` (lines 469-494), replace `await recorder.stop();` with `await stopRecorderOnce(recorder);` so it awaits the same promise the timer started. Keep `clearLimit()` and `finalizeRecording` exactly as they are.
    6. In `cancelRecording` (lines 496-509), replace `recorder.stop();` with `void stopRecorderOnce(recorder);`.
    Keep the file's existing comment style and do not reformat unrelated lines.
  - Done when: a recording that hits the 30 s timer and is then stopped manually results in one `recorder.stop()` call (both callers await the same promise); `stopRecording` still returns the finalized clip; `cancelRecording` still discards; `bun run lint` and `bun run typecheck` pass.

- [x] T2: Guard empty recordings in db.ai.transcribe
  - Files: `src/lib/core/db/ai.ts`, `src/lib/core/db/ai.test.ts`
  - Do:
    1. In `ai.ts`, next to `const NO_RECORDING` (line 94) add `const EMPTY_RECORDING = "empty-recording";`.
    2. In `sendableAudio` (lines 116-140): when `picked` is a recording object whose `base64` is absent/empty and whose `uri` is absent, throw `new Error(EMPTY_RECORDING)` instead of `NO_RECORDING` (so `{ base64: "" }` maps to the empty-recording case). Keep `NO_RECORDING` for a null/undefined/canceled input. Do not change the valid `base64` or `uri` branches or the size caps.
    3. In `transcribe` (lines 497-513) inner catch (lines 503-507): map `EMPTY_RECORDING` to `transcribeFailure(AI_SAYS.noSpeech, 0, detail)` (no request, no consent).
    4. In `transcribe`, immediately after `clip = await sendableAudio(...)` and BEFORE `askAiConsent`, add: `if (!base64Body(clip.data).trim()) return transcribeFailure(AI_SAYS.noSpeech, 0, "The recording had no audio in it.");`.
    5. In `ai.test.ts`, add tests in the `ai.transcribe transport` block: (a) `{ base64: "" }` resolves with `AI_NO_SPEECH` and `fetchMock` is not called; (b) `{ uri: "file://empty.m4a", fileSize: 0 }` where `fetch` resolves to an empty blob resolves with `AI_NO_SPEECH` and the STT endpoint is not called. Keep the existing tests green.
  - Done when: `bun run test` passes and both new cases assert `AI_NO_SPEECH` with no `fetch` to the transcriptions endpoint.

- [x] T3: Fix the Session recording lifecycle and stop control
  - Files: `src/screens/Session/index.tsx`
  - Do:
    1. Import `cancelRecording` from `../../../borel-systemui` (line 16-23). Add a discard icon (`X`) to the `lucide-react-native` import (line 4); remove `Square` if it becomes unused.
    2. Make `say` return the promise: `const say = useCallback((text: string) => speak(text, { language: "en-US", rate: profile.level === "Beginner" ? 0.85 : 1 }), [profile.level]);` (drop the `void`). The replay control keeps calling `say(turn.text)`.
    3. Add `const aliveRef = useRef(true);` and `const turnRef = useRef(0);`.
    4. Replace the unmount effect (line 117) with one that sets `aliveRef.current = false;`, calls `cancelRecording();`, and `void stopSpeaking();`.
    5. Add `const cancelAndDiscard = useCallback(() => { void stopSpeaking(); cancelRecording(); setRecording(false); setNotice(null); }, []);`.
    6. In `openMic` (lines 123-138), `await stopSpeaking();` before checking the permission.
    7. In `advance` (lines 166-205): take `const turn = ++turnRef.current;` before the `say` call; after `await say(reply.text);` add `if (!aliveRef.current || turnRef.current !== turn) return;` before the complete/openMic branch. The `complete` branch now runs only after speech finished.
    8. In `finish` (lines 142-164), add `turnRef.current++;` at the top so a pending `advance` cannot reopen the mic after finishing. Keep its existing `stopSpeaking`/recording logic.
    9. In the composer (lines 386-405): replace the bare `{recording ? <Square .../> : null}` with a `Pressable` (`onPress={cancelAndDiscard}`, `hitSlop={8}`, `style={styles.switchButton}`, `accessibilityRole="button"`, `accessibilityLabel="Stop recording and discard"`) containing `<X size={20} color={colors.accent2} strokeWidth={iconStroke} />`.
    10. On the switch-to-typing `Pressable` (line 398), change `onPress` to `() => { if (recording) cancelAndDiscard(); setTyping(true); }`.
  - Done when: in the browser preview the red control stops and discards without a transcribe request; the composer returns to "Speak your reply"; switching to typing and leaving the screen stop an active recording; the mic opens only after Robin's TTS finishes (spec AC-7); tapping "Finish now" during TTS does not start a recording; `bun run lint`, `bun run typecheck`, and `bun run test` pass.

## Wave 2

- [x] T4: Verify the two bugs end to end
  - Files: none (verification only)
  - Do: after T1-T3, run the project checks (`bun run lint`, `bun run typecheck`, `bun run test`) and re-exercise the browser preview: start a scene, let Robin speak, confirm the mic opens only after speech ends, press the red control and confirm no `POST /audio/transcriptions` fires and no "The AI couldn't answer" notice appears; record and press "Stop and send" and confirm a normal transcribe still works.
  - Done when: all checks pass and the browser flow above is observed, with evidence.
  - Result: `bun run lint`, `bun run typecheck`, and `bun run test` (5 suites, 56 tests) all pass. Code paths verified statically by a verifier subagent. The live browser flow was SKIPPED: the sandbox cannot keep a dev server alive across tool calls (a backgrounded `expo start --web` dies with its bwrap parent), so the Playwright browser could not reach `localhost:8081`; microphone input is also unavailable. No live pass is claimed.

## Finish

- Build: SKIPPED. `package.json` defines no `build` script; the project's verification commands are `lint`, `typecheck`, and `test`, all of which pass.
