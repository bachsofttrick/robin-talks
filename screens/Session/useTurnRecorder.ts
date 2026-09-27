import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelRecording,
  getPermissionStatus,
  getRecordingStatus,
  requestPermission,
  startRecording,
  stopRecording,
} from "../../borel-systemui";
import { initialVoiceActivityState, nextVoiceActivity } from "./voiceActivity";
import type { VoiceActivityState } from "./voiceActivity";

// The clip stopRecording hands back. It is passed to onTurnEnd for
// transcription and never written to storage: user audio is never persisted,
// only the transcript the screen sends next is stored.
export type TurnRecording = {
  uri: string;
  base64: string;
  durationMs: number;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

export type TurnEndHandler = (clip: TurnRecording | null) => void;

const POLL_MS = 150;
const MAX_DURATION_MS = 30000;

export function useTurnRecorder({ onTurnEnd }: { onTurnEnd: TurnEndHandler }) {
  const [recording, setRecording] = useState(false);
  const [denied, setDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadRef = useRef<VoiceActivityState>(initialVoiceActivityState());
  const lastPollRef = useRef(0);
  const activeRef = useRef(false);
  const finishingRef = useRef(false);
  const handlerRef = useRef<TurnEndHandler>(onTurnEnd);

  useEffect(() => {
    handlerRef.current = onTurnEnd;
  }, [onTurnEnd]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishTurn = useCallback(async () => {
    if (!activeRef.current || finishingRef.current) return;
    finishingRef.current = true;
    activeRef.current = false;
    clearTimer();
    const clip = (await stopRecording()) as TurnRecording | null;
    setRecording(false);
    handlerRef.current(clip);
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    finishingRef.current = false;
    try {
      const status = await getPermissionStatus("microphone");
      if (status === "denied") {
        activeRef.current = false;
        finishingRef.current = true;
        setDenied(true);
        return;
      }
      const started = await startRecording({ maxDurationMs: MAX_DURATION_MS });
      if (!started || started.started !== true) {
        activeRef.current = false;
        finishingRef.current = true;
        setDenied(true);
        return;
      }
    } catch {
      activeRef.current = false;
      finishingRef.current = true;
      setDenied(true);
      return;
    }
    setDenied(false);
    setRecording(true);
    vadRef.current = initialVoiceActivityState();
    lastPollRef.current = Date.now();
    clearTimer();
    timerRef.current = setInterval(() => {
      void (async () => {
        if (!activeRef.current || finishingRef.current) return;
        let level: number | undefined;
        try {
          const status = getRecordingStatus() as { metering?: number | null };
          if (status && typeof status.metering === "number") level = status.metering;
        } catch {
          level = undefined;
        }
        const now = Date.now();
        const deltaMs = now - lastPollRef.current || POLL_MS;
        lastPollRef.current = now;
        const result = nextVoiceActivity(vadRef.current, { level, deltaMs });
        vadRef.current = result.state;
        if (result.done) await finishTurn();
      })();
    }, POLL_MS);
  }, [clearTimer, finishTurn]);

  const stop = useCallback(async () => {
    await finishTurn();
  }, [finishTurn]);

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    finishingRef.current = true;
    clearTimer();
    cancelRecording();
    setRecording(false);
  }, [clearTimer]);

  const enableMic = useCallback(async () => {
    const result = await requestPermission("microphone");
    if (result === "allow") {
      setDenied(false);
      await start();
    } else {
      setDenied(true);
    }
  }, [start]);

  useEffect(
    () => () => {
      activeRef.current = false;
      finishingRef.current = true;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cancelRecording();
    },
    [],
  );

  return { recording, denied, start, stop, cancel, enableMic };
}
