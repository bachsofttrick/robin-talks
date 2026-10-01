import { runSessionTool } from "./robinTools";
import type { PastSession, SessionReader } from "./robinTools";

function session(overrides: Partial<PastSession> & { id: string }): PastSession {
  return {
    scenarioId: "coffee",
    scenarioTitle: "Ordering coffee",
    startedAt: "2026-09-01T10:00:00.000Z",
    summary: null,
    transcript: [],
    debrief: null,
    ...overrides,
  };
}

const sessions: PastSession[] = [
  session({
    id: "transcript-hit",
    summary: "A short exchange.",
    transcript: [
      { role: "user", text: "I would like a latte please." },
      { role: "robin", text: "Coming right up." },
    ],
    debrief: JSON.stringify({ summary: "Ordered a drink politely." }),
  }),
  session({
    id: "summary-hit",
    scenarioId: "return",
    scenarioTitle: "Returning a purchase",
    startedAt: "2026-09-02T10:00:00.000Z",
    summary: "Asked for a refund for a broken kettle.",
    transcript: [{ role: "user", text: "It does not work." }],
  }),
  session({
    id: "title-hit",
    scenarioTitle: "Hotel check-in",
    startedAt: "2026-09-03T10:00:00.000Z",
    summary: "Checked in and sorted the room.",
    transcript: [{ role: "user", text: "My room is too small." }],
  }),
  session({ id: "extra-1", summary: "Coffee chat about the weather.", transcript: [] }),
  session({ id: "extra-2", summary: "More coffee talk.", transcript: [] }),
  session({ id: "extra-3", summary: "Even more coffee talk.", transcript: [] }),
  session({ id: "extra-4", summary: "Coffee again.", transcript: [] }),
];

let seenLimit = 0;
const reader: SessionReader = {
  listRecent: async (_userId, limit) => {
    seenLimit = limit;
    return sessions.slice(0, limit);
  },
  getById: async (_userId, id) => sessions.find((s) => s.id === id) ?? null,
};

function isPlainSentence(value: unknown): boolean {
  return typeof value === "string" && /^[A-Z].*\.$/.test(value);
}

describe("runSessionTool", () => {
  it("search matches transcript text", async () => {
    const out = await runSessionTool(reader, "u1", "search_sessions", { query: "latte" });
    expect(out).toContain("transcript-hit");
    expect(out).toContain("latte");
  });

  it("search matches summaries and scenario titles", async () => {
    expect(await runSessionTool(reader, "u1", "search_sessions", { query: "refund" })).toContain("summary-hit");
    expect(await runSessionTool(reader, "u1", "search_sessions", { query: "hotel" })).toContain("title-hit");
  });

  it("search scans up to 25 sessions and returns up to 3 hits", async () => {
    const out = await runSessionTool(reader, "u1", "search_sessions", { query: "coffee" });
    expect(seenLimit).toBe(25);
    const hits = (out ?? "").split("\n").filter((line) => line.startsWith("- "));
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(out).toContain("Ordering coffee");
  });

  it("search reports when nothing matches", async () => {
    const out = await runSessionTool(reader, "u1", "search_sessions", { query: "zebra" });
    expect(isPlainSentence(out)).toBe(true);
  });

  it("get returns the session with a transcript excerpt and debrief summary", async () => {
    const out = await runSessionTool(reader, "u1", "get_session", { id: "transcript-hit" });
    expect(out).toContain("transcript-hit");
    expect(out).toContain("latte");
    expect(out).toContain("Ordered a drink politely.");
  });

  it("get returns null for an unknown id", async () => {
    await expect(runSessionTool(reader, "u1", "get_session", { id: "missing" })).resolves.toBeNull();
  });

  it("recent respects the limit and caps at 5", async () => {
    const two = await runSessionTool(reader, "u1", "list_recent_sessions", { limit: 2 });
    expect((two ?? "").split("\n").filter((line) => line.startsWith("- "))).toHaveLength(2);
    const capped = await runSessionTool(reader, "u1", "list_recent_sessions", { limit: 99 });
    expect(seenLimit).toBe(5);
    expect((capped ?? "").split("\n").filter((line) => line.startsWith("- "))).toHaveLength(5);
  });

  it("unknown tool and bad args return a plain sentence", async () => {
    expect(isPlainSentence(await runSessionTool(reader, "u1", "nope", {}))).toBe(true);
    expect(isPlainSentence(await runSessionTool(reader, "u1", "search_sessions", {}))).toBe(true);
    expect(isPlainSentence(await runSessionTool(reader, "u1", "search_sessions", { query: "  " }))).toBe(true);
    expect(isPlainSentence(await runSessionTool(reader, "u1", "get_session", {}))).toBe(true);
    expect(isPlainSentence(await runSessionTool(reader, "u1", "get_session", { id: 42 }))).toBe(true);
  });
});
