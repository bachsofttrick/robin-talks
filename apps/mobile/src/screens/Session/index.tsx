import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Keyboard, Mic, Send, Volume2, X } from "lucide-react-native";
import { Screen, Notice, EmptyState } from "../../lib/ui";
import { colors, fonts, iconStroke, radius, spacing, type } from "../../lib/ui/theme";
import { Bird } from "../../lib/ui/Bird";
import { Button } from "../../lib/ui/Button";
import { useEnter } from "../../lib/ui/motion";
import { scenarioById } from "../../lib/api/scenarios";
import { useProfile } from "../../lib/api/useProfile";
import { useMemory } from "../../lib/api/useMemory";
import { useSessions, Turn } from "../../lib/api/useSessions";
import { useRobin, Debrief } from "../../lib/api/useRobin";
import { db } from "../../lib/core/db";
import {
  cancelRecording,
  getPermissionStatus,
  requestPermission,
  speak,
  startRecording,
  stopRecording,
  stopSpeaking,
} from "../../lib/core/borel/borel-systemui";

export default function SessionScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { data: profile } = useProfile();
  const { data: memory, remember, reload: reloadMemory } = useMemory();
  // Stable callbacks pulled out of the hooks so effects can depend on them
  // without re-running whenever the hook objects change identity.
  const {
    open: openSession,
    fetchOne,
    reload: reloadSessions,
    recent,
    saveTranscript,
    finish: finishSession,
  } = useSessions();
  const { nextTurn, debrief: runDebrief } = useRobin();

  const [sessionId, setSessionId] = useState<string | null>(route.params?.sessionId ?? null);
  const [scenarioId, setScenarioId] = useState<string | null>(route.params?.scenarioId ?? null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [ready, setReady] = useState(false);
  const scroller = useRef<ScrollView | null>(null);
  // Which session's opening turn was already requested, so a failed opening
  // never re-fires from the auto-start effect below.
  const openedRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const turnRef = useRef(0);
  const enter = useEnter();
  const scenario = scenarioId ? scenarioById(scenarioId) : undefined;

  // Reset state only when the navigation names a different session. Re-opening
  // the session already on screen keeps its conversation, because the load
  // effect reloads it instead of clearing it. The async wrapper keeps these
  // updates off the effect's synchronous path, which the React Compiler lint
  // flags.
  useEffect(() => {
    if (route.params?.sessionId && route.params.sessionId !== sessionId) {
      (async () => {
        setSessionId(route.params.sessionId);
        setScenarioId(route.params.scenarioId ?? null);
        setTranscript([]);
        setDebrief(null);
        setReady(false);
        openedRef.current = null;
      })();
    }
  }, [route.params?.sessionId, route.params?.scenarioId, sessionId]);

  // Load the session named by the route param, or the open session when the
  // screen is opened with no params. Keying on the route param rather than the
  // state it writes means every navigation that names a session triggers a
  // load, including re-opening the session already on screen. The async wrapper
  // keeps the state updates off the effect's synchronous path; the active flag
  // keeps them off an unmounted screen.
  useEffect(() => {
    let active = true;
    const targetSessionId = route.params?.sessionId ?? null;
    (async () => {
      if (targetSessionId) {
        const row = await fetchOne(targetSessionId);
        if (!active) return;
        if (row) {
          setScenarioId(row.scenario_id);
          setTranscript(row.transcript);
        }
        setReady(true);
        return;
      }
      await reloadSessions();
      if (!active) return;
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [route.params?.sessionId, fetchOne, reloadSessions]);

  // Adopt the open session once it arrives. The async wrapper keeps these
  // updates off the effect's synchronous path, which the React Compiler lint
  // flags.
  useEffect(() => {
    if (sessionId || !openSession) return;
    (async () => {
      setSessionId(openSession.id);
      setScenarioId(openSession.scenario_id);
      setTranscript(openSession.transcript);
    })();
  }, [openSession, sessionId]);

  useEffect(
    () => () => {
      aliveRef.current = false;
      cancelRecording();
      void stopSpeaking();
    },
    [],
  );

  const say = useCallback(
    (text: string) => speak(text, { language: "en-US", rate: profile.level === "Beginner" ? 0.85 : 1 }),
    [profile.level],
  );

  const cancelAndDiscard = useCallback(() => {
    void stopSpeaking();
    cancelRecording();
    setRecording(false);
    setNotice(null);
  }, []);

  const openMic = useCallback(async () => {
    await stopSpeaking();
    const status = await getPermissionStatus("microphone");
    if (status === "denied") {
      setMicDenied(true);
      setTyping(true);
      return;
    }
    const started = await startRecording({ maxDurationMs: 30000 });
    if (!started.started) {
      setMicDenied(true);
      setTyping(true);
      return;
    }
    setMicDenied(false);
    setRecording(true);
  }, []);

  // finish is declared before advance because advance calls it on the final
  // turn; a forward reference here trips the React Compiler immutability lint.
  const finish = useCallback(
    async (final: Turn[]) => {
      turnRef.current++;
      if (!scenario || !sessionId) return;
      void stopSpeaking();
      if (recording) {
        setRecording(false);
        await stopRecording();
      }
      setFinishing(true);
      const result = await runDebrief(scenario, profile.level, final, memory);
      if (!result.debrief) {
        setFinishing(false);
        setError(result.error);
        return;
      }
      setDebrief(result.debrief);
      await finishSession(sessionId, final, result.debrief, result.debrief.summary);
      for (const note of result.debrief.memory) await remember("profile", note);
      // The session's score goes into memory, so the next debrief compares
      // against it and Robin's scene prompt carries the trend forward.
      if (result.debrief.performance) {
        await remember(
          "performance",
          "Overall " +
            result.debrief.performance.overall +
            "/100 in " +
            scenario.title +
            ". " +
            result.debrief.performance.comparison,
        );
      }
      void reloadMemory();
      setFinishing(false);
    },
    [scenario, sessionId, recording, runDebrief, profile.level, memory, finishSession, remember, reloadMemory],
  );

  const advance = useCallback(
    async (next: Turn[]) => {
      if (!scenario || !sessionId) return;
      setTranscript(next);
      setThinking(true);
      setError(null);
      const past = await recent();
      const recap = past
        .map((s) => "- " + (scenarioById(s.scenario_id)?.title ?? s.scenario_id) + ": " + (s.summary ?? ""))
        .join("\n");
      const reply = await nextTurn({
        scenario,
        level: profile.level,
        name: profile.displayName,
        memory,
        recap,
        transcript: next,
      });
      if (!reply.text) {
        setThinking(false);
        setError(reply.error);
        return;
      }
      const withRobin = [...next, { role: "robin" as const, text: reply.text }];
      setTranscript(withRobin);
      setThinking(false);
      await saveTranscript(sessionId, withRobin);
      if (reply.remember) {
        await remember("fact", reply.remember);
        void reloadMemory();
      }
      const turn = ++turnRef.current;
      await say(reply.text);
      if (!aliveRef.current || turnRef.current !== turn) return;
      if (reply.complete) {
        void finish(withRobin);
      } else if (!typing) {
        // Prevent mic from turning on with keyboard
        void openMic();
      }
    },
    [scenario, sessionId, profile, memory, typing, nextTurn, recent, saveTranscript, remember, reloadMemory, say, openMic, finish],
  );

  // The async wrapper keeps advance's state updates off the effect's
  // synchronous path, which the React Compiler lint flags. The ref guard keeps
  // a failed opening request from re-firing this effect when thinking flips
  // back to false with an empty transcript.
  useEffect(() => {
    if (!ready || !sessionId || !scenario || transcript.length !== 0 || thinking || debrief) return;
    if (openedRef.current === sessionId) return;
    openedRef.current = sessionId;
    (async () => {
      await advance([]);
    })();
  }, [ready, sessionId, scenario, transcript.length, thinking, debrief, advance]);

  const stopAndSend = async () => {
    setRecording(false);
    const clip = await stopRecording();
    if (!clip) {
      setNotice("Did not catch that. Try again.");
      return;
    }
    setThinking(true);
    const heard = await db.ai.transcribe({ audio: clip, language: "en" });
    setThinking(false);
    if (!heard.text || !heard.text.trim()) {
      setNotice(heard.error ?? "Did not catch that. Try again.");
      void openMic();
      return;
    }
    if (/[^\x00-\x7F]/.test(heard.text)) {
      setNotice("I heard some non-English words. Please speak again in English.");
      void openMic();
      return;
    }
    setNotice(null);
    void advance([...transcript, { role: "user", text: heard.text.trim() }]);
  };

  const sendTyped = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setNotice(null);
    void advance([...transcript, { role: "user", text }]);
  };

  const confirmFinish = () => {
    Alert.alert("Finish now", "Robin will write your debrief from what you have said so far.", [
      { text: "Keep going", style: "cancel" },
      { text: "Finish", style: "destructive", onPress: () => void finish(transcript) },
    ]);
  };

  const enableMic = async () => {
    const result = await requestPermission("microphone");
    if (result === "allow") {
      setMicDenied(false);
      void openMic();
    }
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
        {debrief.performance ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Performance</Text>
            <Text style={styles.score}>{debrief.performance.overall}/100</Text>
            {debrief.performance.comparison ? (
              <Text style={styles.tip}>{debrief.performance.comparison}</Text>
            ) : null}
          </View>
        ) : null}
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
                <Pressable onPress={() => say(turn.text)} hitSlop={10} style={styles.replay}>
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
          <Pressable
            onPress={() => {
              if (recording) cancelAndDiscard();
              setTyping(true);
            }}
            hitSlop={8}
            style={styles.switchButton}
          >
            <Keyboard size={20} color={colors.textSecondary} strokeWidth={iconStroke} />
          </Pressable>
          {recording ? (
            <Pressable
              onPress={cancelAndDiscard}
              hitSlop={8}
              style={styles.switchButton}
              accessibilityRole="button"
              accessibilityLabel="Stop recording and discard"
            >
              <X size={20} color={colors.accent2} strokeWidth={iconStroke} />
            </Pressable>
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
  score: { ...type.title, fontFamily: fonts.bodyMedium, color: colors.accent },
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
