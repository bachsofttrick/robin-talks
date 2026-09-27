import type { ChatMessage } from "../core/db";
import type { Debrief } from "./useRobin";

export interface RobinTurn {
  text: string | null;
  complete: boolean;
  remember: string | null;
  error: string | null;
}

export interface TurnChatResult {
  data: unknown;
  text: string | null;
  error: string | null;
}

export interface RobinTurnDeps {
  chat: (messages: ChatMessage[]) => Promise<TurnChatResult>;
  runTool: (name: string, args: unknown) => Promise<string | null>;
}

const MAX_TOOL_ROUNDS = 3;
const NO_ANSWER = "Robin could not answer just now.";
const FINAL_REPLY_INSTRUCTION = "Reply to the learner now with one reply object. Do not call another tool.";
const NO_SESSION = "No matching session was found.";

type ModelAction =
  | { kind: "reply"; text: unknown; complete: unknown; remember: unknown }
  | { kind: "tool"; name: unknown; args: unknown };

function readAction(data: unknown): ModelAction | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.action === "reply") {
    return { kind: "reply", text: record.text, complete: record.complete, remember: record.remember };
  }
  if (record.action === "tool") {
    return { kind: "tool", name: record.tool, args: record.args };
  }
  if (record.action === undefined && typeof record.text === "string") {
    return { kind: "reply", text: record.text, complete: record.complete, remember: record.remember };
  }
  return null;
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function runRobinTurn(messages: ChatMessage[], deps: RobinTurnDeps): Promise<RobinTurn> {
  let conversation = [...messages];
  let toolRounds = 0;
  for (;;) {
    const res = await deps.chat(conversation);
    const action = readAction(res.data);
    if (action && action.kind === "tool" && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds += 1;
      const name = typeof action.name === "string" ? action.name : "";
      const output = await deps.runTool(name, action.args ?? {});
      conversation = [
        ...conversation,
        { role: "user", content: "[tool result: " + (name || "unknown") + "]\n" + (output ?? NO_SESSION) },
      ];
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        conversation = [...conversation, { role: "user", content: FINAL_REPLY_INSTRUCTION }];
      }
      continue;
    }
    if (action && action.kind === "reply") {
      const text = cleanText(action.text);
      if (!text) {
        return { text: null, complete: false, remember: null, error: res.error ?? NO_ANSWER };
      }
      return {
        text,
        complete: action.complete === true,
        remember: cleanText(action.remember),
        error: null,
      };
    }
    const raw = typeof res.text === "string" ? res.text.trim() : "";
    if (raw) return { text: raw, complete: false, remember: null, error: null };
    return { text: null, complete: false, remember: null, error: res.error ?? NO_ANSWER };
  }
}

export function parseDebrief(data: unknown): Debrief {
  const record = (typeof data === "object" && data !== null ? data : {}) as Partial<Debrief>;
  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    mistakes: Array.isArray(record.mistakes)
      ? record.mistakes
          .filter((m) => m && typeof m.said === "string" && typeof m.better === "string")
          .slice(0, 5)
      : [],
    tips: Array.isArray(record.tips) ? record.tips.filter((t): t is string => typeof t === "string").slice(0, 3) : [],
    memory: Array.isArray(record.memory)
      ? record.memory.filter((t): t is string => typeof t === "string").slice(0, 3)
      : [],
  };
}
