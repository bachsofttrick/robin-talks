import { useCallback } from "react";
import { db } from "../core/db";
import type { ChatMessage } from "../core/db";
import { useAuth } from "../core/auth";
import type { Scenario } from "./scenarios";
import type { Turn } from "./useSessions";
import type { MemoryNote } from "./useMemory";
import { buildSystemPrompt } from "./robinPrompt";
import { parseDebrief, runRobinTurn } from "./robinAgent";
import { runSessionTool } from "./robinTools";
import { sessionReader } from "./sessionReader";

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

export function useRobin() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const nextTurn = useCallback(
    async (args: {
      scenario: Scenario;
      level: string;
      name: string;
      memory: MemoryNote[];
      recap: string;
      transcript: Turn[];
    }): Promise<RobinReply> => {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt({
            scenario: args.scenario,
            level: args.level,
            name: args.name,
            memory: args.memory,
            recap: args.recap,
          }),
        },
        ...args.transcript.map((t) => ({
          role: t.role === "robin" ? ("assistant" as const) : ("user" as const),
          content: t.text,
        })),
      ];
      if (args.transcript.length === 0) {
        messages.push({ role: "user" as const, content: "[The scene begins. Speak first, in character.]" });
      }
      return runRobinTurn(messages, {
        chat: (msgs) => db.ai.chat({ messages: msgs, json: true, model: db.ai.models.fast }),
        runTool: (name, toolArgs) => runSessionTool(sessionReader, userId, name, toolArgs),
      });
    },
    [userId],
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
    if (!res.data) return { debrief: null as Debrief | null, error: res.error ?? "The debrief could not be written." };
    return {
      debrief: parseDebrief(res.data),
      error: null as string | null,
    };
  }, []);

  return { nextTurn, debrief };
}
