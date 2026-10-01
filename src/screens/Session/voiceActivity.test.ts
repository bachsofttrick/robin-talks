import { initialVoiceActivityState, nextVoiceActivity } from "./voiceActivity";
import type { VoiceActivityDoneReason, VoiceActivityState } from "./voiceActivity";

const POLL = 150;

function drive(
  levels: (number | null | undefined)[],
  deltaMs: number = POLL,
  first: VoiceActivityState = initialVoiceActivityState(),
): { state: VoiceActivityState; done: boolean; reason: VoiceActivityDoneReason | null } {
  let state = first;
  for (const level of levels) {
    const result = nextVoiceActivity(state, { level, deltaMs });
    state = result.state;
    if (result.done) return { state, done: true, reason: result.reason };
  }
  return { state, done: false, reason: null };
}

function loud(n: number): number[] {
  return Array(n).fill(0.8);
}

function quiet(n: number): number[] {
  return Array(n).fill(0.05);
}

test("quiet alone never ends the turn", () => {
  const result = drive(quiet(20));
  expect(result.done).toBe(false);
  expect(result.reason).toBeNull();
  expect(result.state.heardSpeech).toBe(false);
});

test("speech then 1.5 s of quiet ends the turn with silence", () => {
  const speech = drive(loud(4));
  expect(speech.done).toBe(false);
  expect(speech.state.heardSpeech).toBe(true);
  const result = drive(quiet(10), POLL, speech.state);
  expect(result.done).toBe(true);
  expect(result.reason).toBe("silence");
});

test("brief dips below the silence level do not end the turn", () => {
  let result = drive(loud(4));
  result = drive(quiet(3), POLL, result.state);
  expect(result.done).toBe(false);
  result = drive(loud(4), POLL, result.state);
  expect(result.done).toBe(false);
  result = drive(quiet(3), POLL, result.state);
  expect(result.done).toBe(false);
  expect(result.state.heardSpeech).toBe(true);
});

test("noise below the speech threshold never counts as speech", () => {
  const levels: number[] = [];
  for (let i = 0; i < 40; i++) levels.push(i % 2 === 0 ? 0.3 : 0.2);
  const result = drive(levels);
  expect(result.done).toBe(false);
  expect(result.state.heardSpeech).toBe(false);
});

test("the 30 s ceiling ends the turn with max", () => {
  const result = drive(loud(200));
  expect(result.done).toBe(true);
  expect(result.reason).toBe("max");
});

test("a missing level counts as silence", () => {
  const speech = drive(loud(4));
  expect(speech.state.heardSpeech).toBe(true);
  const ended = drive(Array(10).fill(undefined), POLL, speech.state);
  expect(ended.done).toBe(true);
  expect(ended.reason).toBe("silence");
  const alone = drive(Array(10).fill(undefined));
  expect(alone.done).toBe(false);
});
