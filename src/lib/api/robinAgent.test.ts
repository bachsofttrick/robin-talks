import { parseDebrief, runRobinTurn } from "./robinAgent";
import type { RobinTurnDeps, TurnChatResult } from "./robinAgent";
import type { ChatMessage } from "../core/db";

const messages: ChatMessage[] = [{ role: "system", content: "Be Robin." }];

function chatResult(overrides: Partial<TurnChatResult> = {}): TurnChatResult {
  return { data: null, text: null, error: null, ...overrides };
}

function toolCall(tool: string, args: unknown = {}): TurnChatResult {
  return chatResult({ data: { action: "tool", tool, args }, text: JSON.stringify({ action: "tool" }) });
}

function reply(data: unknown, text = ""): TurnChatResult {
  return chatResult({ data, text });
}

describe("runRobinTurn", () => {
  it("runs a tool then carries the result back into a reply", async () => {
    const seen: ChatMessage[][] = [];
    const runToolCalls: { name: string; args: unknown }[] = [];
    const deps: RobinTurnDeps = {
      chat: async (msgs) => {
        seen.push(msgs);
        if (seen.length === 1) return toolCall("search_sessions", { query: "coffee" });
        return reply({ action: "reply", text: "One latte coming up.", complete: false, remember: null });
      },
      runTool: async (name, args) => {
        runToolCalls.push({ name, args });
        return "past session about coffee";
      },
    };
    const out = await runRobinTurn(messages, deps);
    expect(runToolCalls).toHaveLength(1);
    expect(runToolCalls[0]).toEqual({ name: "search_sessions", args: { query: "coffee" } });
    expect(seen).toHaveLength(2);
    const toolMessage = seen[1].find(
      (m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[tool result: search_sessions]"),
    );
    expect(toolMessage?.content).toContain("past session about coffee");
    expect(out).toEqual({ text: "One latte coming up.", complete: false, remember: null, error: null });
  });

  it("caps tool rounds at three and tells the model to reply", async () => {
    const seen: ChatMessage[][] = [];
    let runs = 0;
    const deps: RobinTurnDeps = {
      chat: async (msgs) => {
        seen.push(msgs);
        if (seen.length <= 3) return toolCall("list_recent_sessions", { limit: 2 });
        return reply({ action: "reply", text: "Here we go.", complete: false, remember: null });
      },
      runTool: async () => {
        runs += 1;
        return "some sessions";
      },
    };
    const out = await runRobinTurn(messages, deps);
    expect(runs).toBe(3);
    expect(seen).toHaveLength(4);
    const last = seen[3];
    expect(
      last.some((m) => m.role === "user" && typeof m.content === "string" && m.content.includes("Do not call another tool")),
    ).toBe(true);
    expect(out.text).toBe("Here we go.");
  });

  it("stops calling tools after three rounds even when the model keeps asking", async () => {
    let runs = 0;
    const deps: RobinTurnDeps = {
      chat: async () => toolCall("search_sessions", { query: "coffee" }),
      runTool: async () => {
        runs += 1;
        return "some sessions";
      },
    };
    const out = await runRobinTurn(messages, deps);
    expect(runs).toBe(3);
    expect(out.text).not.toBeNull();
  });

  it("falls back to raw text when the JSON is unreadable", async () => {
    const deps: RobinTurnDeps = {
      chat: async () => chatResult({ data: null, text: "  Hello there!  ", error: "Could not read that." }),
      runTool: async () => "unused",
    };
    await expect(runRobinTurn(messages, deps)).resolves.toEqual({
      text: "Hello there!",
      complete: false,
      remember: null,
      error: null,
    });
  });

  it("returns a plain sentence when there is no usable text at all", async () => {
    const deps: RobinTurnDeps = {
      chat: async () => chatResult({ data: null, text: null, error: null }),
      runTool: async () => "unused",
    };
    const out = await runRobinTurn(messages, deps);
    expect(out.text).toBeNull();
    expect(out.error).toMatch(/^[A-Z].*\.$/);
  });

  it("passes the model error through when there is no usable text", async () => {
    const deps: RobinTurnDeps = {
      chat: async () => chatResult({ data: null, text: "   ", error: "Robin took too long." }),
      runTool: async () => "unused",
    };
    const out = await runRobinTurn(messages, deps);
    expect(out).toEqual({ text: null, complete: false, remember: null, error: "Robin took too long." });
  });

  it("passes complete and remember through", async () => {
    const deps: RobinTurnDeps = {
      chat: async () =>
        reply({ action: "reply", text: "Well done!", complete: true, remember: "  Loves football. " }),
      runTool: async () => "unused",
    };
    await expect(runRobinTurn(messages, deps)).resolves.toEqual({
      text: "Well done!",
      complete: true,
      remember: "Loves football.",
      error: null,
    });
  });

  it("accepts a bare reply object without an action field", async () => {
    const deps: RobinTurnDeps = {
      chat: async () => reply({ text: "Welcome in.", complete: false, remember: null }),
      runTool: async () => "unused",
    };
    const out = await runRobinTurn(messages, deps);
    expect(out.text).toBe("Welcome in.");
  });
});

describe("parseDebrief", () => {
  it("keeps summary, mistakes, tips, and memory", () => {
    expect(
      parseDebrief({
        summary: "Ordered coffee.",
        mistakes: [{ said: "I want one coffee", better: "I would like a coffee" }],
        tips: ["Use would like.", "Slow down."],
        memory: ["Mixes up a and the."],
      }),
    ).toEqual({
      summary: "Ordered coffee.",
      mistakes: [{ said: "I want one coffee", better: "I would like a coffee" }],
      tips: ["Use would like.", "Slow down."],
      memory: ["Mixes up a and the."],
    });
  });

  it("filters malformed entries", () => {
    const out = parseDebrief({
      summary: 42,
      mistakes: [{ said: "x" }, { better: "y" }, null, "nope", { said: "a", better: "b" }],
      tips: ["ok", 7, null],
      memory: [false, "kept"],
    });
    expect(out.summary).toBe("");
    expect(out.mistakes).toEqual([{ said: "a", better: "b" }]);
    expect(out.tips).toEqual(["ok"]);
    expect(out.memory).toEqual(["kept"]);
  });

  it("caps at 5 mistakes and 3 tips", () => {
    const out = parseDebrief({
      summary: "s",
      mistakes: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ said: "s" + n, better: "b" + n })),
      tips: ["a", "b", "c", "d"],
      memory: ["a", "b", "c", "d"],
    });
    expect(out.mistakes).toHaveLength(5);
    expect(out.tips).toHaveLength(3);
    expect(out.memory).toHaveLength(3);
  });

  it("returns empty sections for missing data", () => {
    expect(parseDebrief(null)).toEqual({ summary: "", mistakes: [], tips: [], memory: [] });
  });
});
