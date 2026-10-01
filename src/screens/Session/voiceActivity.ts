// Pause detector for voice turns. Pure: given the previous state and one
// level sample, it returns the next state plus whether the turn is over.
// Levels are the 0..1 values getRecordingStatus().metering reports, where 0
// is -60 dBFS or quieter. The unit test drives this with level sequences,
// so this module stays free of recording calls.

export const SPEECH_LEVEL = 0.4;
export const SILENCE_LEVEL = 0.25;
export const MIN_SPEECH_MS = 300;
export const SILENCE_MS = 1500;
export const MAX_TURN_MS = 30000;

export type VoiceActivityState = {
  elapsedMs: number;
  speechMs: number;
  silenceMs: number;
  heardSpeech: boolean;
};

export type VoiceActivitySample = {
  // A missing level (metering unavailable on this poll) counts as silence.
  level?: number | null;
  deltaMs: number;
};

export type VoiceActivityOptions = {
  speechLevel?: number;
  silenceLevel?: number;
  minSpeechMs?: number;
  silenceMs?: number;
  maxTurnMs?: number;
};

export type VoiceActivityDoneReason = "silence" | "max";

export type VoiceActivityResult = {
  state: VoiceActivityState;
  done: boolean;
  reason: VoiceActivityDoneReason | null;
};

export function initialVoiceActivityState(): VoiceActivityState {
  return { elapsedMs: 0, speechMs: 0, silenceMs: 0, heardSpeech: false };
}

export function nextVoiceActivity(
  state: VoiceActivityState,
  sample: VoiceActivitySample,
  options: VoiceActivityOptions = {},
): VoiceActivityResult {
  const speechLevel = options.speechLevel ?? SPEECH_LEVEL;
  const silenceLevel = options.silenceLevel ?? SILENCE_LEVEL;
  const minSpeechMs = options.minSpeechMs ?? MIN_SPEECH_MS;
  const silenceLimitMs = options.silenceMs ?? SILENCE_MS;
  const maxTurnMs = options.maxTurnMs ?? MAX_TURN_MS;

  const deltaMs = Number.isFinite(sample.deltaMs) ? Math.max(0, sample.deltaMs) : 0;
  const level =
    typeof sample.level === "number" && Number.isFinite(sample.level)
      ? Math.min(1, Math.max(0, sample.level))
      : 0;
  const elapsedMs = state.elapsedMs + deltaMs;

  if (elapsedMs >= maxTurnMs) {
    return { state: { ...state, elapsedMs }, done: true, reason: "max" };
  }

  let speechMs = state.speechMs;
  let silenceMs = state.silenceMs;
  let heardSpeech = state.heardSpeech;

  if (level >= speechLevel) {
    speechMs += deltaMs;
    silenceMs = 0;
    if (speechMs >= minSpeechMs) heardSpeech = true;
  } else if (level < silenceLevel) {
    // Quiet resets the speech run, so MIN_SPEECH_MS means continuous speech.
    // Silence only ends a turn once speech was heard, so leading quiet waits.
    speechMs = 0;
    if (heardSpeech) silenceMs += deltaMs;
  } else {
    // Between the two levels the voice may still be present: the pause does
    // not grow, and the speech run so far is kept.
    if (heardSpeech) silenceMs = 0;
  }

  if (heardSpeech && silenceMs >= silenceLimitMs) {
    return { state: { elapsedMs, speechMs, silenceMs, heardSpeech }, done: true, reason: "silence" };
  }
  return { state: { elapsedMs, speechMs, silenceMs, heardSpeech }, done: false, reason: null };
}
