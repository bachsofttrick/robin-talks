import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Keyboard, Mic, Send, Square, Volume2 } from "lucide-react-native";
import { deleteAsync } from "expo-file-system/legacy";
import { Screen, Notice, EmptyState } from "../../ui";
import { colors, fonts, iconStroke, radius, spacing, type } from "../../ui/theme";
import { Bird } from "../../ui/Bird";
import { Button } from "../../ui/Button";
import { useEnter } from "../../ui/motion";
import { scenarioById } from "../../api/scenarios";
import { useProfile } from "../../api/useProfile";
import { useMemory } from "../../api/useMemory";
import { useSessions, Turn } from "../../api/useSessions";
import { useRobin, Debrief } from "../../api/useRobin";
import { db } from "../../core/db";
import { speak, stopSpeaking } from "../../borel-systemui";
import { useTurnRecorder } from "./useTurnRecorder";
import type { TurnRecording } from "./useTurnRecorder";

export default function SessionScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { data: profile } = useProfile();
  const { data: memory, remember, reload: reloadMemory } = useMemory();
  const sessions = useSessions();
  const sessionsFetchOne = sessions.fetchOne;
  const sessionsReload = sessions.reload;
  const robin = useRobin();

  const [sessionId, setSessionId] = useState<string | null>(route.params?.sessionId ?? null);
  const [scenarioId, setScenarioId] = useState<string | null>(route.params?.scenarioId ?? null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [ready, setReady] = useState(false);
  const scroller = useRef<ScrollView | null>(null);
  const enter = useEnter();
  const scenario = scenarioId ? scenarioById(scenarioId) : undefined;

  // Guards so late async work never touches a dead screen or a past session.
  const mountedRef = useRef(true);
  const sessionRef = useRef<string | null>(sessionId);
  const typingRef = useRef(typing);
  const transcriptRef = useRef<Turn[]>(transcript);
  const advanceRef = useRef<(next: Turn[]) => Promise<void>>(async () => {});
  const startMicRef = useRef<() => Promise<void>>(async () => {});
  const sendClipRef = useRef<(clip: TurnRecording | null) => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    typingRef.current = typing;
  }, [typing]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // One shared path for every finished voice turn. The pause detector and
  // the manual stop both land here through the recorder hook.
  const recorder = useTurnRecorder({
    onTurnEnd: useCallback((clip: TurnRecording | null) => {
      sendClipRef.current(clip);
    }, []),
  });
  const { recording, denied: micDenied, start: startMic, stop: stopMic, cancel: cancelMic, enableMic } = recorder;

  useEffect(() => {
    if (route.params?.sessionId) {
      cancelMic();
      const nextId = route.params.sessionId;
      const nextScenarioId = route.params.scenarioId ?? null;
      void Promise.resolve().then(() => {
        setSessionId(nextId);
        setScenarioId(nextScenarioId);
        setTranscript([]);
        setDebrief(null);
        setReady(false);
      });
    }
  }, [route.params?.sessionId, route.params?.scenarioId, cancelMic]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (sessionId) {
        const row = await sessionsFetchOne(sessionId);
        if (!active || !mountedRef.current) return;
        if (row) {
          setScenarioId(row.scenario_id);
          setTranscript(row.transcript);
        }
        setReady(true);
        return;
      }
      await sessionsReload();
      if (!active || !mountedRef.current) return;
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [sessionId, sessionsFetchOne, sessionsReload]);

  useEffect(() => {
    if (!sessionId && sessions.open) {
      const next = sessions.open;
      void Promise.resolve().then(() => {
        setSessionId(next.id);
        setScenarioId(next.scenario_id);
        setTranscript(next.transcript);
      });
    }
  }, [sessions.open, sessionId]);

  // Leaving the screen stops the voice and drops any live recording.
  useEffect(() => {
    const maybeUnsubscribe =
      typeof navigation.addListener === "function"
        ? navigation.addListener("blur", () => {
            cancelMic();
            void stopSpeaking();
          })
        : undefined;
    return () => {
      cancelMic();
      void stopSpeaking();
      if (typeof maybeUnsubscribe === "function") maybeUnsubscribe();
    };
  }, [navigation, cancelMic]);

  // A refused microphone falls back to typing so the scene can continue.
  useEffect(() => {
    if (micDenied) {
      void Promise.resolve().then(() => setTyping(true));
    }
  }, [micDenied]);

  const say = useCallback(
    (text: string) => {
      return speak(text, { language: "en-US", rate: profile.level === "Beginner" ? 0.85 : 1 });
    },
    [profile.level],
  );

  const finish = useCallback(
    async (final: Turn[]) => {
      if (!scenario || !sessionId) return;
      const mySession = sessionId;
      // Cancel so no half spoken turn is transcribed on the way out.
      cancelMic();
      void stopSpeaking();
      if (mountedRef.current) setFinishing(true);
      const result = await robin.debrief(scenario, profile.level, final);
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      if (!result.debrief) {
        setFinishing(false);
        setError(result.error);
        return;
      }
      setDebrief(result.debrief);
      await sessions.finish(mySession, final, JSON.stringify(result.debrief), result.debrief.summary);
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      for (const note of result.debrief.memory) await remember("profile", note);
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      void reloadMemory();
      setFinishing(false);
    },
    [scenario, sessionId, profile.level, robin, sessions, remember, reloadMemory, cancelMic],
  );

  const advance = useCallback(
    async (next: Turn[]) => {
      if (!scenario || !sessionId) return;
      const mySession = sessionId;
      setTranscript(next);
      setThinking(true);
      setError(null);
      const recent = await sessions.recent();
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      const recap = recent
        .map((s) => "- " + (scenarioById(s.scenario_id)?.title ?? s.scenario_id) + ": " + (s.summary ?? ""))
        .join("\n");
      const reply = await robin.nextTurn({
        scenario,
        level: profile.level,
        name: profile.displayName,
        memory,
        recap,
        transcript: next,
      });
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      if (!reply.text) {
        setThinking(false);
        setError(reply.error);
        return;
      }
      const withRobin = [...next, { role: "robin" as const, text: reply.text }];
      setTranscript(withRobin);
      setThinking(false);
      await sessions.saveTranscript(mySession, withRobin);
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      if (reply.remember) {
        await remember("fact", reply.remember);
        if (!mountedRef.current || sessionRef.current !== mySession) return;
        void reloadMemory();
      }
      // Let Robin finish speaking before anything else. The mic opens only
      // after speech ends, so it never records Robin's own voice.
      await say(reply.text);
      if (!mountedRef.current || sessionRef.current !== mySession) return;
      if (reply.complete) {
        await finish(withRobin);
      } else if (!typingRef.current) {
        await startMic();
      }
    },
    [scenario, sessionId, profile, memory, robin, sessions, remember, reloadMemory, say, finish, startMic],
  );

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useEffect(() => {
    startMicRef.current = startMic;
  }, [startMic]);

  useEffect(() => {
    if (ready && sessionId && scenario && transcript.length === 0 && !thinking && !debrief) {
      void Promise.resolve().then(() => advance([]));
    }
  }, [ready, sessionId, scenario, transcript.length, thinking, debrief, advance]);

  // Transcribe one finished clip and send it as the user's turn, the same
  // way for a pause ended turn and a manual stop. Audio is never stored.
  useEffect(() => {
    sendClipRef.current = (clip: TurnRecording | null) => {
      void (async () => {
        const mySession = sessionRef.current;
        if (!mySession || !mountedRef.current) return;
        if (!clip) {
          setNotice("Did not catch that. Try again.");
          return;
        }
        setThinking(true);
        const heard = await db.ai.transcribe({ audio: clip, language: "en" });
        const uri = typeof clip.uri === "string" && clip.uri ? clip.uri : null;
        if (uri) {
          try {
            await deleteAsync(uri, { idempotent: true });
          } catch {
            // The temp file is best effort cleanup only.
          }
        }
        if (!mountedRef.current || sessionRef.current !== mySession) return;
        setThinking(false);
        if (!heard.text || !heard.text.trim()) {
          setNotice(heard.error ?? "Did not catch that. Try again.");
          if (!typingRef.current) void startMicRef.current();
          return;
        }
        setNotice(null);
        void advanceRef.current([...transcriptRef.current, { role: "user", text: heard.text.trim() }]);
      })();
    };
  }, []);

  const stopAndSend = () => {
    void stopMic();
  };

  const openMic = () => {
    void startMic();
  };

  const sendTyped = () => {
    const text = draft.trim();
    if (!text) return;
    // Drop any live recording so it cannot send after the typed turn.
    cancelMic();
    setDraft("");
    setNotice(null);
    void advance([...transcript, { role: "user", text }]);
  };

  const switchToTyping = () => {
    cancelMic();
    setTyping(true);
  };

  const confirmFinish = () => {
    Alert.alert("Finish now", "Robin will write your debrief from what you have said so far.", [
      { text: "Keep going", style: "cancel" },
      { text: "Finish", style: "destructive", onPress: () => void finish(transcript) },
    ]);
  };

  if (!sessionId || !scenario) {
    return (
      <Screen>
        <EmptyState
          title="No scene open"
          message="Pick a scene and Robin will meet you there."
          icon={<Bird size={28} />}
          actionLabel="Choose a scene"
          onAction={() => navigation.navigate("Practice")}
        />
      </Screen>
    );
  }

  if (debrief) {
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <Animated.View style={[styles.header, enter]}>
          <Text style={styles.eyebrow}>{scenario.title}</Text>
          <Text style={styles.heroTitle}>How it went</Text>
          <Text style={styles.body}>{debrief.summary}</Text>
        </Animated.View>
        {debrief.mistakes.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Better phrasings</Text>
            {debrief.mistakes.map((m, i) => (
              <View key={i} style={styles.mistake}>
                <Text style={styles.said}>{m.said}</Text>
                <Text style={styles.better}>{m.better}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {debrief.tips.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>To work on</Text>
            {debrief.tips.map((t, i) => (
              <Text key={i} style={styles.tip}>
                {t}
              </Text>
            ))}
          </View>
        ) : null}
        <Button label="Back to scenes" onPress={() => navigation.navigate("Practice")} style={styles.done} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <View style={styles.sessionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{scenario.level} scene</Text>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {scenario.title}
          </Text>
        </View>
        <Pressable onPress={confirmFinish} hitSlop={10} style={({ pressed }) => [styles.finish, pressed && styles.pressed]}>
          <Text style={styles.finishLabel}>Finish now</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.turns}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {transcript.map((turn, i) =>
          turn.role === "robin" ? (
            <View key={i} style={styles.robinTurn}>
              <Bird size={18} />
              <View style={styles.robinText}>
                <Text style={styles.robinLine}>{turn.text}</Text>
                <Pressable onPress={() => void say(turn.text)} hitSlop={10} style={styles.replay}>
                  <Volume2 size={16} color={colors.textSecondary} strokeWidth={iconStroke} />
                  <Text style={styles.replayLabel}>Play again</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={i} style={styles.userTurn}>
              <Text style={styles.userLine}>{turn.text}</Text>
            </View>
          ),
        )}
        {thinking ? <ActivityIndicator color={colors.accent} style={styles.thinking} /> : null}
      </ScrollView>

      {error ? <Notice message={error} onRetry={() => void advance(transcript)} /> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {micDenied ? (
        <View style={styles.micBlock}>
          <Text style={styles.notice}>Robin cannot hear you without the microphone. Typing still works.</Text>
          <Pressable onPress={enableMic} hitSlop={10}>
            <Text style={styles.link}>Turn the microphone on</Text>
          </Pressable>
        </View>
      ) : null}

      {finishing ? (
        <View style={styles.bar}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.barLabel}>Writing your debrief</Text>
        </View>
      ) : typing ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your reply"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={sendTyped}
            autoCapitalize="sentences"
          />
          <Pressable onPress={sendTyped} disabled={!draft.trim() || thinking} style={styles.iconButton}>
            <Send size={20} color={draft.trim() ? colors.surface : colors.textMuted} strokeWidth={iconStroke} />
          </Pressable>
          {!micDenied ? (
            <Pressable onPress={() => setTyping(false)} hitSlop={8} style={styles.switchButton}>
              <Mic size={20} color={colors.textSecondary} strokeWidth={iconStroke} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.composer}>
          {recording ? (
            <Button label="Stop and send" onPress={stopAndSend} style={styles.grow} />
          ) : (
            <Button
              label={thinking ? "Robin is speaking" : "Speak your reply"}
              onPress={openMic}
              disabled={thinking}
              style={styles.grow}
            />
          )}
          <Pressable onPress={switchToTyping} hitSlop={8} style={styles.switchButton}>
            <Keyboard size={20} color={colors.textSecondary} strokeWidth={iconStroke} />
          </Pressable>
          {recording ? (
            <Square size={16} color={colors.accent2} strokeWidth={iconStroke} style={styles.recDot} />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.sm, marginTop: spacing.lg },
  heroTitle: { ...type.display, color: colors.text },
  eyebrow: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.accent },
  body: { ...type.body, color: colors.textSecondary },
  block: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.text },
  blockTitle: { ...type.title, color: colors.text },
  mistake: { gap: 2, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  said: { ...type.secondary, color: colors.textMuted, textDecorationLine: "line-through" },
  better: { ...type.body, fontFamily: fonts.bodyMedium, color: colors.text },
  tip: { ...type.body, color: colors.textSecondary },
  done: { marginTop: spacing.md },
  sessionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  sessionTitle: { ...type.title, color: colors.text },
  finish: { minHeight: 44, justifyContent: "center" },
  finishLabel: { ...type.secondary, color: colors.textSecondary, textDecorationLine: "underline" },
  pressed: { opacity: 0.6 },
  scroll: { flex: 1 },
  turns: { gap: spacing.lg, paddingVertical: spacing.md, flexGrow: 1 },
  robinTurn: { flexDirection: "row", gap: spacing.sm },
  robinText: { flex: 1, gap: spacing.xs },
  robinLine: { ...type.body, fontFamily: fonts.body, color: colors.text },
  replay: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 32 },
  replayLabel: { ...type.caption, color: colors.textSecondary },
  userTurn: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.accentSoft,
  },
  userLine: { ...type.body, color: colors.text },
  thinking: { alignSelf: "flex-start" },
  notice: { ...type.secondary, color: colors.accent2 },
  link: { ...type.secondary, fontFamily: fonts.bodyMedium, color: colors.accent, textDecorationLine: "underline" },
  micBlock: { gap: spacing.xs, paddingBottom: spacing.sm },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  grow: { flex: 1 },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    ...type.body,
    color: colors.text,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  switchButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  recDot: { marginLeft: 2 },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  barLabel: { ...type.body, color: colors.textSecondary },
});
