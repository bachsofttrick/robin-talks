import { buildSystemPrompt } from "./robinPrompt";
import { SCENARIOS } from "./scenarios";
import type { MemoryNote } from "./useMemory";

const scenario = SCENARIOS[0];

function note(id: string, content: string): MemoryNote {
  return { id, kind: "fact", content };
}

function base(overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) {
  return {
    scenario,
    level: "Beginner",
    name: "Ana",
    memory: [],
    recap: "",
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("includes the declared level and a Beginner vocabulary line", () => {
    const prompt = buildSystemPrompt(base({ level: "Beginner" }));
    expect(prompt).toContain("Declared level: Beginner");
    expect(prompt).toContain("short, simple sentences");
  });

  it("uses different complexity lines per level", () => {
    expect(buildSystemPrompt(base({ level: "Advanced" }))).toContain("idiomatic");
    expect(buildSystemPrompt(base({ level: "Intermediate" }))).toContain("moderate complexity");
    expect(buildSystemPrompt(base({ level: "Advanced" }))).not.toContain("short, simple sentences");
  });

  it("includes the scenario role, setting, and goal", () => {
    const prompt = buildSystemPrompt(base());
    expect(prompt).toContain(scenario.robinRole);
    expect(prompt).toContain(scenario.setting);
    expect(prompt).toContain(scenario.goal);
  });

  it("includes every memory item", () => {
    const memory = [note("1", "Learner works as a nurse."), note("2", "Learner mixes up he and she.")];
    const prompt = buildSystemPrompt(base({ memory }));
    expect(prompt).toContain("Learner works as a nurse.");
    expect(prompt).toContain("Learner mixes up he and she.");
  });

  it("says Nothing yet when memory is empty", () => {
    expect(buildSystemPrompt(base())).toContain("Nothing yet.");
  });

  it("names the learner and appends the recap", () => {
    const prompt = buildSystemPrompt(base({ name: "Ana", recap: "- Coffee: ordered a latte." }));
    expect(prompt).toContain("Ana");
    expect(prompt).toContain("- Coffee: ordered a latte.");
  });

  it("states the tool protocol", () => {
    const prompt = buildSystemPrompt(base());
    expect(prompt).toContain("search_sessions");
    expect(prompt).toContain("get_session");
    expect(prompt).toContain("list_recent_sessions");
    expect(prompt).toContain('"action"');
    expect(prompt).toContain("[tool result:");
  });

  it("keeps the correction and no-greeting rules", () => {
    const prompt = buildSystemPrompt(base());
    expect(prompt).toContain("correction or a better phrasing");
    expect(prompt).toContain("Never greet the learner");
    expect(prompt).toContain("in character");
  });
});
