import { SCENARIOS, scenarioById } from "./scenarios";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

describe("SCENARIOS catalog", () => {
  it("has 6 to 8 scenarios", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(SCENARIOS.length).toBeLessThanOrEqual(8);
  });

  it("has unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a non-empty title, description, and goal", () => {
    for (const s of SCENARIOS) {
      expect(typeof s.title).toBe("string");
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(typeof s.description).toBe("string");
      expect(s.description.trim().length).toBeGreaterThan(0);
      expect(typeof s.goal).toBe("string");
      expect(s.goal.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has a level in Beginner / Intermediate / Advanced", () => {
    for (const s of SCENARIOS) {
      expect(LEVELS).toContain(s.level);
    }
  });

  it("scenarioById finds an entry by id", () => {
    for (const s of SCENARIOS) {
      expect(scenarioById(s.id)).toEqual(s);
    }
  });
});
