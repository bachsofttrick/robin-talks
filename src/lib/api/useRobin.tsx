import { useCallback } from "react";
import { db } from "../core/db";
import type { Scenario } from "./scenarios";
import type { Turn } from "./useSessions";
import type { MemoryNote } from "./useMemory";

export interface RobinReply {
  text: string | null;
  complete: boolean;
  remember: string | null;
  error: string | null;
}

export interface Debrief {
  summary: string;
  mistakes: { said: string; better: string }[];
  tips: string[];
  memory: string[];
}

function systemPrompt(scenario: Scenario, level: string, name: string, memory: MemoryNote[], recap: string) {
  const mem = memory.length ? memory.map((m) => "- " + m.content).join("\n") : "Nothing yet.";
  return [
    "You are Robin, an English speaking partner. You play " + scenario.robinRole + " in this scene: " + scenario.setting + ".",
    "The learner's goal: " + scenario.goal + ". Learner name: " + (name || "unknown") + ". Declared level: " + level + ".",
    level === "Beginner"
      ? "Use short, simple sentences and everyday words."
      : level === "Advanced"
        ? "Use natural, idiomatic, fast-paced English with full complexity."
        : "Use clear everyday English of moderate complexity.",
    "Never greet the learner as an app or introduce yourself as an assistant. Stay fully in character from the first word.",
    "When the learner makes a significant English mistake, briefly give the correction or a better phrasing inside your reply, then continue the scene in character.",
    "If the learner writes in another language or is unintelligible, stay in English and give one short hint to try in English.",
    "Keep each turn under 45 words.",
    "What you remember about this learner:\n" + mem,
    recap ? "Notes from their recent practice:\n" + recap : "",
    'Reply as JSON: { "text": your spoken turn, "complete": true only when the scene\'s goal is finished, "remember": a durable fact about the learner to store, or null }.',
  ]
    .filter(Boolean)
    .join("\n");
}

export function useRobin() {
  const nextTurn = useCallback(
    async (args: {
      scenario: Scenario;
      level: string;
      name: string;
      memory: MemoryNote[];
      recap: string;
      transcript: Turn[];
    }): Promise<RobinReply> => {
      const messages = [
        {
          role: "system" as const,
          content: systemPrompt(args.scenario, args.level, args.name, args.memory, args.recap),
        },
        ...args.transcript.map((t) => ({
          role: t.role === "robin" ? ("assistant" as const) : ("user" as const),
          content: t.text,
        })),
      ];
      if (args.transcript.length === 0) {
        messages.push({ role: "user" as const, content: "[The scene begins. Speak first, in character.]" });
      }
      const res = await db.ai.chat({ messages, json: true, model: db.ai.models.fast });
      const data = res.data as { text?: string; complete?: boolean; remember?: string | null } | null;
      if (!data || typeof data.text !== "string") {
        return { text: null, complete: false, remember: null, error: res.error ?? "Robin could not answer just now." };
      }
      return {
        text: data.text.trim(),
        complete: data.complete === true,
        remember: typeof data.remember === "string" && data.remember.trim() ? data.remember.trim() : null,
        error: null,
      };
    },
    [],
  );

  const debrief = useCallback(async (scenario: Scenario, level: string, transcript: Turn[]) => {
    const script = transcript.map((t) => (t.role === "robin" ? "Robin: " : "Learner: ") + t.text).join("\n");
    const res = await db.ai.chat({
      json: true,
      model: db.ai.models.smart,
      messages: [
        {
          role: "system",
          content:
            "You coach English speaking practice. Review only what actually happened in this " +
            level +
            " level scene (" +
            scenario.title +
            "). Reply as JSON: { \"summary\": one or two sentences about the scene, \"mistakes\": up to 5 objects with said and better, \"tips\": 2 to 3 short targeted tips, \"memory\": up to 3 short durable notes about this learner's recurring mistakes, vocabulary or preferences }.",
        },
        { role: "user", content: script || "The learner ended before speaking." },
      ],
    });
    const data = res.data as Partial<Debrief> | null;
    if (!data) return { debrief: null as Debrief | null, error: res.error ?? "The debrief could not be written." };
    return {
      debrief: {
        summary: typeof data.summary === "string" ? data.summary : "",
        mistakes: Array.isArray(data.mistakes)
          ? data.mistakes
              .filter((m) => m && typeof m.said === "string" && typeof m.better === "string")
              .slice(0, 5)
          : [],
        tips: Array.isArray(data.tips) ? data.tips.filter((t) => typeof t === "string").slice(0, 3) : [],
        memory: Array.isArray(data.memory) ? data.memory.filter((t) => typeof t === "string").slice(0, 3) : [],
      } as Debrief,
      error: null as string | null,
    };
  }, []);

  return { nextTurn, debrief };
}
